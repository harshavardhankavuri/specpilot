export type HttpMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";

export type AuthRoleConfig =
  | { kind: "bearer-token"; tokenVar: string }
  | {
      kind: "bearer-login";
      loginPath: string;
      loginMethod?: HttpMethod;
      usernameVar: string;
      passwordVar: string;
      // Field names in the login request body — default to "username"/"password".
      // Set these when the API's LoginRequest uses different names (e.g. "email").
      usernameField?: string;
      passwordField?: string;
      tokenPath: string;
      tokenExpiresAtPath?: string;
      extraBody?: Record<string, unknown>;
    }
  | { kind: "basic"; usernameVar: string; passwordVar: string }
  | { kind: "api-key"; headerName: string; keyVar: string }
  | { kind: "custom"; strategyModule: string };

export type DbDialect = "postgres" | "mssql";

export interface DbConnectionConfig {
  dialect: DbDialect;
  urlVar: string;
}

export interface ApiTestConfig {
  spec: string;
  baseUrlVar?: string;
  baseUrl?: string;
  auth?: {
    roles: Record<string, AuthRoleConfig>;
  };
  db?: {
    connections: Record<string, DbConnectionConfig>;
  };
  scenariosDir?: string;
  specCacheDir?: string;
}

export function defineConfig(config: ApiTestConfig): ApiTestConfig {
  return config;
}
