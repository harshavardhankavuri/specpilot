import { describe, it, expect } from "vitest";
import { toPostgresSql } from "../../src/db/PostgresAdapter.js";
import { toMssqlSql } from "../../src/db/MssqlAdapter.js";
import type { DbAdapter } from "../../src/db/DbAdapter.js";

describe("shared `?` placeholder translation", () => {
  it("translates to Postgres $1, $2, ... form", () => {
    expect(toPostgresSql("SELECT * FROM t WHERE a = ? AND b = ?")).toBe("SELECT * FROM t WHERE a = $1 AND b = $2");
  });

  it("translates to mssql @p1, @p2, ... form", () => {
    expect(toMssqlSql("SELECT * FROM t WHERE a = ? AND b = ?")).toBe("SELECT * FROM t WHERE a = @p1 AND b = @p2");
  });
});

/**
 * Parameterized contract test: any DbAdapter implementation — real or fake — must
 * satisfy this shape, so authors of scenario/custom-step code never branch on dialect.
 */
function makeFakeAdapter(dialect: "postgres" | "mssql"): DbAdapter {
  const rows: Record<string, unknown>[] = [];
  return {
    dialect,
    async query<T>(sql: string, params: unknown[] = []) {
      if (sql.startsWith("INSERT")) {
        rows.push({ id: params[0] });
        return [] as T[];
      }
      return rows as T[];
    },
    async withTransaction(fn) {
      return fn(this);
    },
    async close() {},
  };
}

describe.each<["postgres" | "mssql"]>([["postgres"], ["mssql"]])("DbAdapter contract (%s)", (dialect) => {
  it("supports query and withTransaction with the same call shape regardless of dialect", async () => {
    const adapter = makeFakeAdapter(dialect);
    await adapter.withTransaction(async (tx) => {
      await tx.query("INSERT INTO t (id) VALUES (?)", ["abc"]);
    });
    const result = await adapter.query<{ id: string }>("SELECT * FROM t");
    expect(result).toEqual([{ id: "abc" }]);
    await adapter.close();
  });
});
