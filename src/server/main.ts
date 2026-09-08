import { mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  ConsoleAnalyticsProvider,
  NullAnalyticsProvider,
  SqliteAnalyticsProvider,
  type AnalyticsProvider,
} from './analytics/provider.ts';
import { loadConfig } from './config.ts';
import { SqliteRepository } from './data/sqliteRepository.ts';
import { seedDatabase } from './data/seed/index.ts';
import { createApp } from './http/server.ts';

const config = loadConfig();

if (config.dbDriver !== 'sqlite') {
  console.error(
    `DB_DRIVER=${config.dbDriver} has no implementation yet. Write one against Repository and register it here.`,
  );
  process.exit(1);
}

mkdirSync(path.dirname(config.dbPath), { recursive: true });

const repo = new SqliteRepository(config.dbPath);
const seed = await seedDatabase(repo.driver, config.seedProfile);

const analytics: AnalyticsProvider =
  config.analyticsProvider === 'console'
    ? new ConsoleAnalyticsProvider()
    : config.analyticsProvider === 'none'
      ? new NullAnalyticsProvider()
      : new SqliteAnalyticsProvider(repo);

const server = createApp({ repo, analytics, config });

server.listen(config.port, config.host, () => {
  console.log(`今日どうする？ PoC  http://${config.host}:${config.port}`);
  console.log(
    `  seed=${seed.profile} places=${seed.places}` +
      (seed.placeholderValues > 0
        ? `  placeholder-values=${seed.placeholderValues} (デモ用の未検証データを表示します)`
        : '  すべての未確認項目は ？ のままです'),
  );
  console.log(`  db=${config.dbPath}  analytics=${config.analyticsProvider}  map=${config.mapProvider}`);
});

function shutdown(signal: string): void {
  console.log(`\n${signal} received, closing.`);
  server.close(() => {
    repo.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
