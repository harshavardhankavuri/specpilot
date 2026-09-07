import { test as base, request as playwrightRequest } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ApiTestConfig } from "../types/config.js";
import type { OperationDescriptor } from "../spec/loadSpec.js";
import { readSpecCache } from "../spec/loadSpec.js";
import type { DbAdapter } from "../db/DbAdapter.js";
import { openConnection } from "../db/openConnection.js";
import { resolveAuthHeaders } from "../auth/resolveAuthHeaders.js";
import type { CachedToken } from "../auth/AuthStrategy.js";

async function loadConfig(): Promise<ApiTestConfig> {
  const configPath = path.resolve("apitest.config.ts");
  const mod = (await import(pathToFileURL(configPath).href)) as { default: ApiTestConfig };
  return mod.default;
}

function resolveBaseUrl(config: ApiTestConfig, specServers: string[]): string {
  if (config.baseUrlVar && process.env[config.baseUrlVar]) return process.env[config.baseUrlVar]!;
  if (config.baseUrl) return config.baseUrl;
  if (specServers[0]) return specServers[0];
  throw new Error(
    "No base URL resolved: set `baseUrl` or `baseUrlVar` in apitest.config.ts, or ensure the OpenAPI " +
      "spec declares a `servers[0].url`."
  );
}

interface ApiTestFixtures {
  config: ApiTestConfig;
  spec: Map<string, OperationDescriptor>;
  baseUrl: string;
  roleRequest: (role: string) => Promise<APIRequestContext>;
  db: (connectionName: string) => Promise<DbAdapter>;
}

interface ApiTestWorkerFixtures {
  tokenCache: Map<string, CachedToken>;
  dbPools: Map<string, DbAdapter>;
  roleRequestContexts: Map<string, APIRequestContext>;
}

export const test = base.extend<ApiTestFixtures, ApiTestWorkerFixtures>({
  tokenCache: [async ({}, use) => {
    await use(new Map());
  }, { scope: "worker" }],

  dbPools: [async ({}, use) => {
    const pools = new Map<string, DbAdapter>();
    await use(pools);
    for (const pool of pools.values()) await pool.close();
  }, { scope: "worker" }],

  roleRequestContexts: [async ({}, use) => {
    const contexts = new Map<string, APIRequestContext>();
    await use(contexts);
    for (const ctx of contexts.values()) await ctx.dispose();
  }, { scope: "worker" }],

  config: async ({}, use) => {
    await use(await loadConfig());
  },

  spec: async ({}, use) => {
    await use(readSpecCache().operations);
  },

  baseUrl: async ({ config }, use) => {
    const loaded = readSpecCache();
    await use(resolveBaseUrl(config, loaded.servers));
  },

  roleRequest: async ({ config, baseUrl, request, tokenCache, roleRequestContexts }, use) => {
    await use(async (role: string) => {
      const cached = roleRequestContexts.get(role);
      if (cached) return cached;
      const headers = await resolveAuthHeaders(config, role, request, baseUrl, tokenCache);
      const ctx = await playwrightRequest.newContext({ baseURL: baseUrl, extraHTTPHeaders: headers });
      roleRequestContexts.set(role, ctx);
      return ctx;
    });
  },

  db: async ({ config, dbPools }, use) => {
    await use(async (connectionName: string) => {
      const cached = dbPools.get(connectionName);
      if (cached) return cached;
      const adapter = await openConnection(config, connectionName);
      dbPools.set(connectionName, adapter);
      return adapter;
    });
  },

  request: async ({ baseUrl, playwright }, use) => {
    const ctx = await playwright.request.newContext({ baseURL: baseUrl });
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect } from "@playwright/test";
