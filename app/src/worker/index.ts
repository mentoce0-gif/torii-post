import { SqliteAnalyticsProvider } from '../server/analytics/provider.ts';
import { buildRouter } from '../server/api/routes.ts';
import type { Config } from '../server/config.ts';
import { D1Driver, type D1Database } from '../server/data/d1Driver.ts';
import { SqlRepository } from '../server/data/sqlRepository.ts';
import { SCHEMA_SQL } from '../server/data/schema.ts';
import { seedDatabase, type SeedProfile } from '../server/data/seed/index.ts';
import { HttpError, SECURITY_HEADERS } from '../server/http/respond.ts';
import { RateLimiter } from '../server/http/rateLimit.ts';
import type { RequestContext } from '../server/http/router.ts';

/**
 * The Cloudflare deployment.
 *
 * Everything that decides anything — domain/, the routes, the repository — is
 * the same code the Node server runs. This file is only the adapter: a fetch
 * event in, a Response out, D1 in place of a file on disk.
 *
 * Why D1 rather than a managed Postgres: a D1 database has no public endpoint.
 * There is no host, no port and no connection string, so there is no credential
 * that can leak and nothing on the internet that can address the stored data.
 * The only way in is a Worker this database is bound to. That makes "the
 * collected data cannot be pulled out from outside" a property of the platform
 * rather than a promise about secret handling.
 */

export interface Env {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  SEED_PROFILE?: string;
  DEFAULT_AREA_CODE?: string;
  RATE_LIMIT_PER_MIN?: string;
  RATE_LIMIT_READ_PER_MIN?: string;
  /** A secret. Without it /api/metrics is unreachable here — see below. */
  METRICS_TOKEN?: string;
}

const MAX_BODY_BYTES = 32 * 1024;

function intOr(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function configFrom(env: Env): Config {
  return {
    port: 0,
    host: '',
    dbDriver: 'd1',
    dbPath: '',
    seedProfile: env.SEED_PROFILE === 'demo' ? 'demo' : 'poc',
    analyticsProvider: 'sqlite',
    mapProvider: 'schematic',
    rateLimitPerMin: intOr(env.RATE_LIMIT_PER_MIN, 60),
    rateLimitReadPerMin: intOr(env.RATE_LIMIT_READ_PER_MIN, 240),
    // Every request arrives from Cloudflare's edge, so the socket address is
    // never the client. CF-Connecting-IP is set by the edge and cannot be
    // spoofed by the caller, and that is what the limiter keys on below.
    trustProxy: true,
    defaultAreaCode: env.DEFAULT_AREA_CODE ?? 'shiga-otsu',
    metricsToken: env.METRICS_TOKEN ?? '',
    publicDir: '',
  };
}

/**
 * Schema and seed, once per database rather than once per request.
 *
 * A Worker isolate is short-lived and there is no boot hook, so this is done
 * lazily and memoised on the module. Both halves are idempotent — the schema is
 * CREATE TABLE IF NOT EXISTS, the seed upserts curated rows and never touches a
 * household — so a cold start racing another one costs a little work and
 * changes nothing.
 */
let ready: Promise<void> | null = null;

function ensureReady(driver: D1Driver, profile: SeedProfile): Promise<void> {
  ready ??= (async () => {
    await driver.exec(SCHEMA_SQL);
    const seeded = await driver.first<{ n: number }>('SELECT COUNT(*) AS n FROM places');
    if (!seeded || seeded.n === 0) await seedDatabase(driver, profile);
  })().catch((error) => {
    // A failed init must not be cached as done, or the Worker serves an empty
    // database until the next deploy.
    ready = null;
    throw error;
  });
  return ready;
}

// One limiter per isolate. Cloudflare spreads requests over many isolates, so
// this is a backstop and not the real control: the enforcement point for a
// public deployment is a WAF rate-limiting rule on the zone, which sees every
// request. Documented in README's deploy section.
const writeLimiter = new RateLimiter(60);
const readLimiter = new RateLimiter(240);

function readHouseholdId(request: Request): string | null {
  const value = request.headers.get('x-household-id');
  if (!value || value.length > 64 || !/^[A-Za-z0-9-]+$/.test(value)) return null;
  return value;
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    if (!url.pathname.startsWith('/api/')) {
      const asset = await env.ASSETS.fetch(request);
      // Static assets are served by the platform; the headers are ours.
      const headers = new Headers(asset.headers);
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
      return new Response(asset.body, { status: asset.status, headers });
    }

    const config = configFrom(env);
    const driver = new D1Driver(env.DB);

    try {
      await ensureReady(driver, config.seedProfile);

      const repo = new SqlRepository(driver);
      const router = buildRouter({
        repo,
        analytics: new SqliteAnalyticsProvider(repo),
        config,
      });

      const householdId = readHouseholdId(request);
      // Set by Cloudflare's edge on every request and not forwardable by the
      // caller, unlike X-Forwarded-For on an origin server.
      const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const key = householdId ?? clientIp;

      const verdict = (method === 'GET' ? readLimiter : writeLimiter).check(key);
      if (!verdict.allowed) {
        return json(
          429,
          { error: 'rate_limited', message: 'リクエストが多すぎます' },
          { 'Retry-After': String(verdict.retryAfterSec) },
        );
      }

      const match = router.match(method, url.pathname);
      if (!match) {
        return json(404, { error: 'not_found', message: 'エンドポイントがありません' });
      }

      let body: unknown;
      if (method !== 'GET' && method !== 'DELETE') {
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) {
          throw new HttpError(413, 'body_too_large', 'request body too large');
        }
        if (text.length > 0) {
          try {
            body = JSON.parse(text);
          } catch {
            throw new HttpError(400, 'invalid_json', 'request body is not valid JSON');
          }
        }
      }

      const ctx: RequestContext = {
        params: match.params,
        query: url.searchParams,
        body,
        householdId,
        clientKey: key,
        header: (name) => request.headers.get(name),
        // There is no loopback here. Left empty deliberately: /api/metrics
        // falls back to requiring METRICS_TOKEN, which is the only correct
        // answer for an endpoint reachable from the internet.
        peerAddress: '',
      };

      const result = await match.handler(ctx);
      return json(method === 'POST' ? 201 : 200, result ?? { ok: true });
    } catch (error) {
      if (error instanceof HttpError) {
        return json(error.status, { error: error.code, message: error.message });
      }
      console.error('[worker] unhandled error', error);
      return json(500, { error: 'internal_error', message: '情報を取得できませんでした' });
    }
  },
};
