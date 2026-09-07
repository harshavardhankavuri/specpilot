import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BearerTokenStrategy, BasicStrategy, ApiKeyStrategy, BearerLoginStrategy } from "../../src/auth/strategies.js";
import type { APIRequestContext } from "@playwright/test";

describe("static auth strategies", () => {
  afterEach(() => {
    delete process.env.MY_TOKEN;
    delete process.env.MY_USER;
    delete process.env.MY_PASS;
    delete process.env.MY_KEY;
  });

  it("BearerTokenStrategy reads from env and formats the header", async () => {
    process.env.MY_TOKEN = "abc123";
    const strategy = new BearerTokenStrategy({ kind: "bearer-token", tokenVar: "MY_TOKEN" });
    const headers = await strategy.getHeaders({} as never);
    expect(headers).toEqual({ Authorization: "Bearer abc123" });
  });

  it("BearerTokenStrategy throws when the env var is unset", async () => {
    const strategy = new BearerTokenStrategy({ kind: "bearer-token", tokenVar: "MISSING_VAR" });
    await expect(strategy.getHeaders({} as never)).rejects.toThrow(/MISSING_VAR/);
  });

  it("BasicStrategy base64-encodes username:password", async () => {
    process.env.MY_USER = "alice";
    process.env.MY_PASS = "secret";
    const strategy = new BasicStrategy({ kind: "basic", usernameVar: "MY_USER", passwordVar: "MY_PASS" });
    const headers = await strategy.getHeaders({} as never);
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("alice:secret").toString("base64")}`);
  });

  it("ApiKeyStrategy sets the configured header name", async () => {
    process.env.MY_KEY = "key-value";
    const strategy = new ApiKeyStrategy({ kind: "api-key", headerName: "X-Api-Key", keyVar: "MY_KEY" });
    const headers = await strategy.getHeaders({} as never);
    expect(headers).toEqual({ "X-Api-Key": "key-value" });
  });
});

describe("BearerLoginStrategy", () => {
  beforeEach(() => {
    process.env.MY_USER = "alice";
    process.env.MY_PASS = "secret";
  });
  afterEach(() => {
    delete process.env.MY_USER;
    delete process.env.MY_PASS;
  });

  it("logs in and caches the token per role for subsequent calls", async () => {
    let loginCalls = 0;
    const fakeRequest = {
      post: async () => {
        loginCalls++;
        return {
          ok: () => true,
          json: async () => ({ access_token: "tok-1" }),
        };
      },
    } as unknown as APIRequestContext;

    const cache = new Map();
    const strategy = new BearerLoginStrategy(
      { kind: "bearer-login", loginPath: "/login", usernameVar: "MY_USER", passwordVar: "MY_PASS", tokenPath: "$.access_token" },
      cache
    );

    const first = await strategy.getHeaders({ request: fakeRequest, role: "customer", baseUrl: "https://api.test" });
    const second = await strategy.getHeaders({ request: fakeRequest, role: "customer", baseUrl: "https://api.test" });

    expect(first).toEqual({ Authorization: "Bearer tok-1" });
    expect(second).toEqual({ Authorization: "Bearer tok-1" });
    expect(loginCalls).toBe(1);
  });

  it("throws with response context when the token path is missing from the response", async () => {
    const fakeRequest = {
      post: async () => ({ ok: () => true, json: async () => ({ nope: true }) }),
    } as unknown as APIRequestContext;
    const strategy = new BearerLoginStrategy(
      { kind: "bearer-login", loginPath: "/login", usernameVar: "MY_USER", passwordVar: "MY_PASS", tokenPath: "$.access_token" },
      new Map()
    );
    await expect(
      strategy.getHeaders({ request: fakeRequest, role: "customer", baseUrl: "https://api.test" })
    ).rejects.toThrow(/did not contain a token/);
  });
});
