import type { DatabaseSync } from 'node:sqlite';

import { NodeSqliteDriver } from './driver.ts';
import { SCHEMA_SQL } from './schema.ts';
import { SqlRepository } from './sqlRepository.ts';

export { SqlRepository };

/**
 * The single-process deployment, and every test.
 *
 * Kept apart from {@link SqlRepository} so that importing the repository does
 * not drag `node:sqlite` in with it. The Worker build imports the other file;
 * this one would pull a Node built-in into a runtime that only stubs it.
 */
export class SqliteRepository extends SqlRepository {
  readonly #driver: NodeSqliteDriver;

  constructor(path: string) {
    const driver = new NodeSqliteDriver(path);
    super(driver);
    this.#driver = driver;
    // A local file can take its schema synchronously at construction; D1 gets
    // the same statements on first request instead.
    driver.handle.exec(SCHEMA_SQL);
  }

  /** The seeder writes through this. Routes must go through the interface. */
  get driver(): NodeSqliteDriver {
    return this.#driver;
  }

  /** Raw handle, for tests that inspect rows the interface does not expose. */
  get handle(): DatabaseSync {
    return this.#driver.handle;
  }
}
