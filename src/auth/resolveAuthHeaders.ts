import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import type { ApiTestConfig } from "../types/config.js";
import type { CachedToken, AuthStrategy } from "./AuthStrategy.js";
import { buildStrategy } from "./strategies.js";

export async function resolveAuthHeaders(
  config: ApiTestConfig,
  role: string,
  request: APIRequestContext,
  baseUrl: string,
  tokenCache: Map<string, CachedToken>
): Promise<Record<string, string>> {
  const roleConfig = config.auth?.roles[role];
  if (!roleConfig) {
    throw new Error(`Unknown auth role "${role}" — not declared in apitest.config.ts under auth.roles.`);
  }

  let strategy: AuthStrategy;
  if (roleConfig.kind === "custom") {
    const modulePath = path.resolve(roleConfig.strategyModule);
    const mod = (await import(modulePath)) as { default: AuthStrategy };
    strategy = mod.default;
  } else {
    strategy = buildStrategy(roleConfig, tokenCache);
  }

  return strategy.getHeaders({ request, role, baseUrl });
}
