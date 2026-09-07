import mssql from "mssql";
import type { DbAdapter } from "./DbAdapter.js";

/** Translates the shared `?` placeholder syntax into named mssql params `@p1, @p2, ...`. */
export function toMssqlSql(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `@p${++i}`);
}

function bindParams(request: mssql.Request, params: unknown[]): void {
  params.forEach((p, idx) => request.input(`p${idx + 1}`, p as never));
}

class MssqlAdapterImpl implements DbAdapter {
  readonly dialect = "mssql" as const;
  constructor(
    private readonly pool: mssql.ConnectionPool,
    private readonly transaction?: mssql.Transaction
  ) {}

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const request = this.transaction ? new mssql.Request(this.transaction) : this.pool.request();
    bindParams(request, params);
    const result = await request.query(toMssqlSql(sql));
    return result.recordset as T[];
  }

  async withTransaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    const transaction = new mssql.Transaction(this.pool);
    await transaction.begin();
    try {
      const tx = new MssqlAdapterImpl(this.pool, transaction);
      const result = await fn(tx);
      await transaction.commit();
      return result;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async close(): Promise<void> {
    await this.pool.close();
  }
}

export async function createMssqlAdapter(connectionString: string): Promise<DbAdapter> {
  const pool = await new mssql.ConnectionPool(connectionString).connect();
  return new MssqlAdapterImpl(pool);
}
