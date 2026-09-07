import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import type { ApiTestConfig } from "../types/config.js";

export function loadEnvFile(envName: string): void {
  const envFile = path.join("environments", `${envName}.env`);
  if (fs.existsSync(envFile)) dotenv.config({ path: envFile });
}

export async function loadConfig(configPath = "apitest.config.ts"): Promise<ApiTestConfig> {
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Config file not found at ${abs}. Run "apitest init" first.`);
  }
  const mod = (await import(pathToFileURL(abs).href)) as { default: ApiTestConfig };
  return mod.default;
}
