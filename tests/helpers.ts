import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import { NullAnalyticsProvider, SqliteAnalyticsProvider } from '../src/server/analytics/provider.ts';
import type { Config } from '../src/server/config.ts';
import { SqliteRepository } from '../src/server/data/sqliteRepository.ts';
import { seedDatabase, type SeedProfile } from '../src/server/data/seed/index.ts';
import { createApp } from '../src/server/http/server.ts';

export interface TestServer {
  base: string;
  repo: SqliteRepository;
  stop(): Promise<void>;
  fetch(path: string, init?: RequestInit & { householdId?: string }): Promise<Response>;
  json<T>(path: string, init?: RequestInit & { householdId?: string }): Promise<T>;
}

export async function makeRepo(profile: SeedProfile = 'demo'): Promise<SqliteRepository> {
  const dir = mkdtempSync(path.join(tmpdir(), 'kns-test-'));
  const repo = new SqliteRepository(path.join(dir, 'test.sqlite'));
  await seedDatabase(repo.driver, profile);
  return repo;
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    dbDriver: 'sqlite',
    dbPath: ':memory:',
    seedProfile: 'demo',
    analyticsProvider: 'sqlite',
    mapProvider: 'schematic',
    rateLimitPerMin: 0,
    rateLimitReadPerMin: 0,
    trustProxy: false,
    defaultAreaCode: 'shiga-otsu',
    metricsToken: '',
    publicDir: path.resolve(import.meta.dirname, '../public'),
    ...overrides,
  };
}

export async function startServer(
  profile: SeedProfile = 'demo',
  overrides: Partial<Config> = {},
): Promise<TestServer> {
  const dir = mkdtempSync(path.join(tmpdir(), 'kns-test-'));
  const dbPath = path.join(dir, 'test.sqlite');
  const repo = new SqliteRepository(dbPath);
  await seedDatabase(repo.driver, profile);

  const config = testConfig({ dbPath, seedProfile: profile, ...overrides });
  const server = createApp({
    repo,
    analytics: new SqliteAnalyticsProvider(repo),
    config,
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const call = (target: string, init: RequestInit & { householdId?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.householdId) headers.set('X-Household-Id', init.householdId);
    if (init.body) headers.set('Content-Type', 'application/json');
    return fetch(base + target, { ...init, headers });
  };

  return {
    base,
    repo,
    fetch: call,
    async json<T>(target: string, init?: RequestInit & { householdId?: string }): Promise<T> {
      const response = await call(target, init ?? {});
      return (await response.json()) as T;
    },
    async stop(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      repo.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const nullAnalytics = new NullAnalyticsProvider();

export const BASE_CONTEXT = {
  childAgeMonths: 18,
  remainingMinutes: 90,
  mobility: 'car' as const,
  weather: 'cloudy' as const,
  origin: { areaCode: 'shiga-kusatsu' },
};
