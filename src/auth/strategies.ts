import type { AuthRoleConfig } from "../types/config.js";
import type {
  AuthStrategy,
  AuthStrategyContext,
  CachedToken,
} from "./AuthStrategy.js";
import { requireEnv } from "./AuthStrategy.js";
import { jsonPath } from "../runtime/jsonPath.js";

export class BearerTokenStrategy implements AuthStrategy {
  constructor(
    private readonly config: Extract<AuthRoleConfig, { kind: "bearer-token" }>,
  ) {}
  async getHeaders(): Promise<Record<string, string>> {
    const token = requireEnv(this.config.tokenVar);
    return { Authorization: `Bearer ${token}` };
  }
}

export class BasicStrategy implements AuthStrategy {
  constructor(
    private readonly config: Extract<AuthRoleConfig, { kind: "basic" }>,
  ) {}
  async getHeaders(): Promise<Record<string, string>> {
    const username = requireEnv(this.config.usernameVar);
    const password = requireEnv(this.config.passwordVar);
    const encoded = Buffer.from(`${username}:${password}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
}

export class ApiKeyStrategy implements AuthStrategy {
  constructor(
    private readonly config: Extract<AuthRoleConfig, { kind: "api-key" }>,
  ) {}
  async getHeaders(): Promise<Record<string, string>> {
    const key = requireEnv(this.config.keyVar);
    return { [this.config.headerName]: key };
  }
}

/**
 * Logs in once per (role, worker) and caches the token in memory for the lifetime
 * of the calling worker process — no filesystem cache, no cross-process teardown.
 */
export class BearerLoginStrategy implements AuthStrategy {
  constructor(
    private readonly config: Extract<AuthRoleConfig, { kind: "bearer-login" }>,
    private readonly cache: Map<string, CachedToken>,
  ) {}

  async getHeaders(ctx: AuthStrategyContext): Promise<Record<string, string>> {
    const cached = this.cache.get(ctx.role);
    const now = Date.now();
    if (cached && (!cached.expiresAt || cached.expiresAt > now)) {
      return { Authorization: `Bearer ${cached.token}` };
    }

    const username = requireEnv(this.config.usernameVar);
    const password = requireEnv(this.config.passwordVar);
    const usernameField = this.config.usernameField ?? "username";
    const passwordField = this.config.passwordField ?? "password";
    const method = (this.config.loginMethod ?? "post").toLowerCase() as
      | "post"
      | "put";
    const loginUrl = new URL(this.config.loginPath, ctx.baseUrl).toString();
    const response = await ctx.request[method](loginUrl, {
      data: {
        [usernameField]: username,
        [passwordField]: password,
        ...(this.config.extraBody ?? {}),
      },
    });
    if (!response.ok()) {
      throw new Error(
        `Login for role "${ctx.role}" failed: ${response.status()} ${await response.text().catch(() => "")}`,
      );
    }
    const body = await response.json();
    const token = jsonPath(body, this.config.tokenPath) as string | undefined;
    if (!token) {
      throw new Error(
        `Login response for role "${ctx.role}" did not contain a token at path "${this.config.tokenPath}". ` +
          `Response body: ${JSON.stringify(body)}`,
      );
    }
    let expiresAt: number | undefined;
    if (this.config.tokenExpiresAtPath) {
      const raw = jsonPath(body, this.config.tokenExpiresAtPath);
      if (typeof raw === "number")
        expiresAt = raw > 1e12 ? raw : Date.now() + raw * 1000;
    }
    this.cache.set(ctx.role, { token, expiresAt });
    return { Authorization: `Bearer ${token}` };
  }
}

export function buildStrategy(
  config: AuthRoleConfig,
  cache: Map<string, CachedToken>,
): AuthStrategy {
  switch (config.kind) {
    case "bearer-token":
      return new BearerTokenStrategy(config);
    case "basic":
      return new BasicStrategy(config);
    case "api-key":
      return new ApiKeyStrategy(config);
    case "bearer-login":
      return new BearerLoginStrategy(config, cache);
    case "custom":
      throw new Error(
        `Auth role uses kind "custom" (strategyModule "${config.strategyModule}") — custom auth strategy loading ` +
          `is resolved by resolveAuthHeaders via dynamic import, not buildStrategy.`,
      );
  }
}
