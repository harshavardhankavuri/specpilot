import path from "node:path";
import { loadConfig, loadEnvFile } from "./loadConfig.js";
import { openConnection } from "../db/openConnection.js";
import { introspect } from "../db/introspect.js";

export interface DbIntrospectOptions {
  connection: string;
  out?: string;
  env?: string;
}

export async function runDbIntrospect(options: DbIntrospectOptions): Promise<void> {
  loadEnvFile(options.env ?? "dev");
  const config = await loadConfig();
  const db = await openConnection(config, options.connection);
  const outFile = options.out ?? path.join("src", "db", "types", `${options.connection}.ts`);
  try {
    await introspect(db, options.connection, outFile);
    console.log(`Wrote types for connection "${options.connection}" to ${outFile}`);
  } finally {
    await db.close();
  }
}
