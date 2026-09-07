import { fileURLToPath } from 'node:url';
import path from 'node:path';

import type { SeedProfile } from './data/seed/index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(here, '../..');

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function intEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface Config {
  port: number;
  host: string;
  dbDriver: string;
  dbPath: string;
  seedProfile: SeedProfile;
  analyticsProvider: 'sqlite' | 'console' | 'none';
  mapProvider: 'schematic' | 'external_link';
  rateLimitPerMin: number;
  /**
   * Reads get their own, looser budget. They were previously unlimited, which
   * on a public free service is an open invitation: every GET costs a SQLite
   * read and nothing capped how many arrived.
   */
  rateLimitReadPerMin: number;
  /**
   * Trust `X-Forwarded-For` for the client address. Off by default because the
   * header is attacker-controlled when nothing strips it — trusting it on a
   * directly-exposed port would let anyone forge a fresh identity per request
   * and walk straight through the limiter. Turn it on only when the process
   * sits behind a proxy that overwrites the header (the TLS terminator).
   */
  trustProxy: boolean;
  /**
   * Where a household starts from before it has said. The PoC runs from Otsu,
   * so a first-time visitor gets Otsu rather than a wall. It is shown on screen
   * as a default the household can change, never presented as their location.
   */
  defaultAreaCode: string;
  /**
   * Required to read /api/metrics from anything but a loopback address. Empty
   * means the endpoint is loopback-only, which is the safe default for a PoC.
   */
  metricsToken: string;
  publicDir: string;
}

export function loadConfig(): Config {
  const profile = env('SEED_PROFILE', 'poc');
  const analytics = env('ANALYTICS_PROVIDER', 'sqlite');
  const map = env('MAP_PROVIDER', 'schematic');

  return {
    port: intEnv('PORT', 8787),
    host: env('HOST', '127.0.0.1'),
    dbDriver: env('DB_DRIVER', 'sqlite'),
    dbPath: path.resolve(APP_ROOT, env('DB_PATH', './data/poc.sqlite')),
    seedProfile: profile === 'demo' ? 'demo' : 'poc',
    analyticsProvider:
      analytics === 'console' || analytics === 'none' ? analytics : 'sqlite',
    mapProvider: map === 'external_link' ? 'external_link' : 'schematic',
    rateLimitPerMin: intEnv('RATE_LIMIT_PER_MIN', 60),
    rateLimitReadPerMin: intEnv('RATE_LIMIT_READ_PER_MIN', 240),
    trustProxy: env('TRUST_PROXY', 'false') === 'true',
    defaultAreaCode: env('DEFAULT_AREA_CODE', 'shiga-otsu'),
    metricsToken: env('METRICS_TOKEN', ''),
    publicDir: path.join(APP_ROOT, 'public'),
  };
}
