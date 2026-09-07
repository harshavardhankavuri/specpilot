import type { ApiTestConfig, DbConnectionConfig } from "../types/config.js";
import type { DbAdapter } from "./DbAdapter.js";
import { createPostgresAdapter } from "./PostgresAdapter.js";
import { createMssqlAdapter } from "./MssqlAdapter.js";

export async function openConnection(config: ApiTestConfig, connectionName: string): Promise<DbAdapter> {
  const conn: DbConnectionConfig | undefined = config.db?.connections[connectionName];
  if (!conn) {
    throw new Error(
      `Unknown db connection "${connectionName}" — not declared in apitest.config.ts under db.connections.`
    );
  }
  const url = process.env[conn.urlVar];
  if (!url) {
    throw new Error(`Environment variable "${conn.urlVar}" is not set (required for db connection "${connectionName}").`);
  }
  if (conn.dialect === "postgres") return createPostgresAdapter(url);
  return createMssqlAdapter(url);
}
