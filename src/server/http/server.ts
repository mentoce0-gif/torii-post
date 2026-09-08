import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { buildRouter } from '../api/routes.ts';
import type { Deps } from '../api/deps.ts';
import { RateLimiter } from './rateLimit.ts';
import { HttpError, applySecurityHeaders, sendJson } from './respond.ts';
import type { RequestContext } from './router.ts';
import { serveStatic } from './static.ts';

const MAX_BODY_BYTES = 32 * 1024;

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'body_too_large', 'request body too large');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json', 'request body is not valid JSON');
  }
}

/**
 * The address to hold responsible for a request.
 *
 * Behind a TLS terminator every connection arrives from the proxy, so
 * `remoteAddress` is one value for the whole internet: without this the limiter
 * would count all households as a single client and the first abuser would lock
 * everyone out. The left-most `X-Forwarded-For` entry is the original client —
 * but only where a proxy is actually rewriting that header, which is why this
 * is opt-in. On a directly-exposed port the header is whatever the caller typed.
 */
export function peerAddress(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const header = req.headers['x-forwarded-for'];
    const raw = Array.isArray(header) ? header[0] : header;
    const first = raw?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * A stable-enough key for the limiter without keeping an address around: the
 * household id when we have one, and the peer address otherwise.
 */
function clientKey(req: IncomingMessage, householdId: string | null, trustProxy: boolean): string {
  return householdId ?? peerAddress(req, trustProxy);
}

function readHouseholdId(req: IncomingMessage): string | null {
  const header = req.headers['x-household-id'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || value.length > 64 || !/^[A-Za-z0-9-]+$/.test(value)) return null;
  return value;
}

export function createApp(deps: Deps): Server {
  const router = buildRouter(deps);
  const limiter = new RateLimiter(deps.config.rateLimitPerMin);
  // Reads are cheaper than writes but not free, and they were uncapped.
  const readLimiter = new RateLimiter(deps.config.rateLimitReadPerMin);
  const sweep = setInterval(() => {
    limiter.sweep();
    readLimiter.sweep();
  }, 60_000);
  sweep.unref();

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    applySecurityHeaders(res);

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const method = req.method ?? 'GET';
    const isApi = url.pathname.startsWith('/api/');

    try {
      if (isApi) {
        const householdId = readHouseholdId(req);
        const key = clientKey(req, householdId, deps.config.trustProxy);

        const verdict = (method === 'GET' ? readLimiter : limiter).check(key);
        if (!verdict.allowed) {
          res.setHeader('Retry-After', String(verdict.retryAfterSec));
          sendJson(res, 429, { error: 'rate_limited', message: 'リクエストが多すぎます' });
          return;
        }

        const match = router.match(method, url.pathname);
        if (!match) {
          sendJson(res, 404, { error: 'not_found', message: 'エンドポイントがありません' });
          return;
        }

        const body = method === 'GET' || method === 'DELETE' ? undefined : await readBody(req);
        const ctx: RequestContext = {
          header: (name) => {
            const value = req.headers[name.toLowerCase()];
            const first = Array.isArray(value) ? value[0] : value;
            return first ?? null;
          },
          peerAddress: req.socket.remoteAddress ?? '',
          params: match.params,
          query: url.searchParams,
          body,
          householdId,
          clientKey: key,
        };

        const result = await match.handler(ctx);
        if (res.writableEnded) return;
        sendJson(res, method === 'POST' ? 201 : 200, result ?? { ok: true });
        return;
      }

      if (method === 'GET' || method === 'HEAD') {
        if (await serveStatic(res, deps.config.publicDir, url.pathname)) return;
        // Client-side routes are hash-based, but a deep link or a refresh on an
        // unknown path should still land on the shell.
        if (!url.pathname.includes('.') && (await serveStatic(res, deps.config.publicDir, '/'))) {
          return;
        }
      }

      sendJson(res, 404, { error: 'not_found', message: 'not found' });
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.code, message: error.message });
        return;
      }
      console.error('[server] unhandled error', error);
      // Deliberately vague to the client, detailed in the log: an internal
      // message is an information leak.
      sendJson(res, 500, {
        error: 'internal_error',
        message: '情報を取得できませんでした',
      });
    }
  });
}
