import type { SqlDriver } from './driver.ts';

/**
 * The shape of D1 this driver uses. Declared here rather than pulled from
 * `@cloudflare/workers-types` so the server build stays dependency-free and
 * typechecks without the Workers ambient types loaded.
 */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

/**
 * D1, reached over a Worker binding.
 *
 * The binding is the whole security story for stored data: D1 has no public
 * endpoint, no connection string and no port. Nothing outside a Worker this
 * database is bound to can address it at all, so "don't let the collected data
 * be pulled out from outside" is enforced by the platform rather than by a
 * password we would otherwise have to keep out of a repository and a log.
 */
export class D1Driver implements SqlDriver {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  #stmt(sql: string, params: readonly unknown[]): D1PreparedStatement {
    const prepared = this.#db.prepare(sql);
    // bind() with no arguments is not the same as not calling it.
    return params.length > 0 ? prepared.bind(...params) : prepared;
  }

  async first<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    return await this.#stmt(sql, params).first<T>();
  }

  async all<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const { results } = await this.#stmt(sql, params).all<T>();
    return results ?? [];
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    const result = await this.#stmt(sql, params).run();
    return { changes: result.meta?.changes ?? 0 };
  }

  /**
   * Multi-statement DDL. D1 has no `exec` that takes a whole script with
   * comments in it, so the schema is split and sent as one batch — all of it
   * applies or none does, which matters when this runs on a fresh database.
   */
  async exec(sql: string): Promise<void> {
    const statements = splitStatements(sql);
    if (statements.length === 0) return;
    await this.#db.batch(statements.map((text) => this.#db.prepare(text)));
  }

  close(): void {
    // A binding is not a connection; there is nothing to release.
  }
}

/**
 * Splits a schema script into statements, dropping comments, blank lines and
 * PRAGMAs.
 *
 * D1 rejects PRAGMA with SQLITE_AUTH, and the two the schema carries are both
 * questions for a local file rather than for D1: `journal_mode = WAL` is how
 * one process should write to a disk, and `foreign_keys = ON` is already the
 * default there. Dropping them here keeps schema.ts authoritative for the Node
 * deployment instead of splitting the schema in two.
 *
 * Deliberately simple, and safe because it only ever sees `schema.ts` — a
 * constant in this repository with no user input anywhere near it. It would not
 * be safe against a semicolon inside a string literal, and the schema has none.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => (line.trim().startsWith('--') ? '' : line))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
    .filter((statement) => !/^pragma\b/i.test(statement));
}
