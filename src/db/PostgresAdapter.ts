import pg from "pg";
import type { DbAdapter } from "./DbAdapter.js";

/** Translates the shared `?` placeholder syntax into Postgres's `$1, $2, ...`. */
export function toPostgresSql(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

class PostgresAdapterImpl implements DbAdapter {
  readonly dialect = "postgres" as const;
  constructor(private readonly client: pg.Pool | pg.PoolClient) {}

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.client.query(toPostgresSql(sql), params);
    return result.rows as T[];
  }

  async withTransaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    if (!("connect" in this.client)) {
      throw new Error("Nested transactions are not supported.");
    }
    const client = await (this.client as pg.Pool).connect();
    try {
      await client.query("BEGIN");
      const tx = new PostgresAdapterImpl(client);
      try {
        const result = await fn(tx);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if ("end" in this.client) {
      await (this.client as pg.Pool).end();
    }
  }
}

export function createPostgresAdapter(connectionString: string): DbAdapter {
  const pool = new pg.Pool({ connectionString });
  return new PostgresAdapterImpl(pool);
}
