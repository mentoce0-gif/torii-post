import { DatabaseSync } from 'node:sqlite';

/**
 * The only thing the repository knows about a database.
 *
 * Two runtimes have to serve the same rows: `node:sqlite` in this process, and
 * D1 over a binding inside a Worker. Their APIs differ in shape (statement
 * objects versus bound statements) and, more importantly, in time — one answers
 * immediately, the other over a network. Writing the repository twice would
 * mean two sets of SQL drifting apart, and a divergence there is a data bug
 * nobody would see until it was in production. So the repository is written
 * once against this, and the runtimes differ only here.
 *
 * Every method is async because the slowest implementation has to be.
 */
export interface SqlDriver {
  /** One row, or null. */
  first<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T | null>;
  /** Every matching row. */
  all<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** A write. `changes` is how many rows it touched — deletes report on it. */
  run(sql: string, params?: readonly unknown[]): Promise<{ changes: number }>;
  /** Multi-statement DDL, used for the schema. Never takes user input. */
  exec(sql: string): Promise<void>;
  close(): void;
}

/** `node:sqlite`, for the single-process deployment and every test. */
export class NodeSqliteDriver implements SqlDriver {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
  }

  /** The seeder writes through this. Routes go through the Repository. */
  get handle(): DatabaseSync {
    return this.#db;
  }

  async first<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const row = this.#db.prepare(sql).get(...(params as never[]));
    return (row as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    return this.#db.prepare(sql).all(...(params as never[])) as T[];
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    const result = this.#db.prepare(sql).run(...(params as never[]));
    return { changes: Number(result.changes) };
  }

  async exec(sql: string): Promise<void> {
    this.#db.exec(sql);
  }

  close(): void {
    this.#db.close();
  }
}
