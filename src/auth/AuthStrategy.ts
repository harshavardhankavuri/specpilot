import type { APIRequestContext } from "@playwright/test";

export interface AuthStrategyContext {
  request: APIRequestContext;
  role: string;
  baseUrl: string;
}

export interface AuthStrategy {
  getHeaders(ctx: AuthStrategyContext): Promise<Record<string, string>>;
}

export interface CachedToken {
  token: string;
  expiresAt?: number;
}

function requireEnv(varName: string): string {
  const value = process.env[varName];
  if (!value) {
    throw new Error(`Environment variable "${varName}" is required for auth but is not set.`);
  }
  return value;
}

export { requireEnv };
