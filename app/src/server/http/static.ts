import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serves the app shell. Nothing here is facility data, so these can be cached;
 * the service worker caches the same set and never touches /api.
 */
export async function serveStatic(
  res: ServerResponse,
  publicDir: string,
  pathname: string,
): Promise<boolean> {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(publicDir, relative);

  // Refuse anything that climbs out of public/.
  if (target !== publicDir && !target.startsWith(publicDir + path.sep)) return false;

  let info;
  try {
    info = await stat(target);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;

  const ext = path.extname(target).toLowerCase();
  // The service worker must never be served from a stale cache, or the app
  // cannot be updated. Everything else revalidates.
  const cacheControl =
    path.basename(target) === 'sw.js' ? 'no-cache' : 'public, max-age=0, must-revalidate';

  res.writeHead(200, {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': cacheControl,
    'Last-Modified': info.mtime.toUTCString(),
  });
  await new Promise<void>((resolve, reject) => {
    createReadStream(target).on('error', reject).on('end', resolve).pipe(res);
  });
  return true;
}
