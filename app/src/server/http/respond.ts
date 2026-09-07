import type { ServerResponse } from 'node:http';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // The install requirement is HTTPS anyway, so once a terminator is in front
  // there is no reason to let a first request downgrade. Harmless over plain
  // HTTP: browsers ignore it on an insecure origin.
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  // Geolocation is the one capability the app asks for, and only to reduce a
  // fix to a town name. Nothing here wants a camera, a microphone, or a wallet.
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
  // Everything the app needs is served from this origin. No third-party script,
  // no analytics beacon, no tile server reaching out from the page.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; '),
};

export function applySecurityHeaders(res: ServerResponse): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    // Facility data must never be served from a cache that outlives its
    // freshness. The service worker enforces the same rule on its side.
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
export const notFound = (message = 'not found') => new HttpError(404, 'not_found', message);
export const unauthorized = (message = 'unauthorized') =>
  new HttpError(401, 'unauthorized', message);
