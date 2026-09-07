/** @type {import("apitest-framework/config").ApiTestConfig} */
export default {
  spec: "https://assertquest.com/docs/json",
  baseUrlVar: "BASE_URL",
  auth: {
    roles: {
      admin: {
        kind: "bearer-login",
        loginPath: "/api/auth/login",
        usernameVar: "ADMIN_USERNAME",
        passwordVar: "ADMIN_PASSWORD",
        usernameField: "email",
        tokenPath: "$.tokens.accessToken",
        tokenExpiresAtPath: "$.tokens.accessTokenExpiresAt",
      },
      dispatcher: {
        kind: "bearer-login",
        loginPath: "/api/auth/login",
        usernameVar: "DISPATCHER_USERNAME",
        passwordVar: "DISPATCHER_PASSWORD",
        usernameField: "email",
        tokenPath: "$.tokens.accessToken",
        tokenExpiresAtPath: "$.tokens.accessTokenExpiresAt",
      },
      driver: {
        kind: "bearer-login",
        loginPath: "/api/auth/login",
        usernameVar: "DRIVER_USERNAME",
        passwordVar: "DRIVER_PASSWORD",
        usernameField: "email",
        tokenPath: "$.tokens.accessToken",
        tokenExpiresAtPath: "$.tokens.accessTokenExpiresAt",
      },
      customer: {
        kind: "bearer-login",
        loginPath: "/api/auth/login",
        usernameVar: "CUSTOMER_USERNAME",
        passwordVar: "CUSTOMER_PASSWORD",
        usernameField: "email",
        tokenPath: "$.tokens.accessToken",
        tokenExpiresAtPath: "$.tokens.accessTokenExpiresAt",
      },
    },
  },
  db: {
    connections: {
      // Backs the self-hosted stack in ../assertquest (docker-compose.yml's `postgres` +
      // `api` services) — only reachable when running against `--env local`. The hosted
      // `dev` environment's assertquest.com has no locally-reachable DB, so `primary` is
      // simply unused (never looked up) for any scenario run under `--env dev`.
      primary: {
        dialect: "postgres",
        urlVar: "PRIMARY_DB_URL",
      },
    },
  },
};
