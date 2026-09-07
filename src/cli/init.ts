import fs from "node:fs";
import path from "node:path";
import { loadSpec } from "../spec/loadSpec.js";
import type { AuthRoleConfig } from "../types/config.js";

export interface InitOptions {
  spec: string;
}

const LOGIN_PATH_HINTS = ["/login", "/auth/login", "/token", "/auth/token", "/signin", "/sign-in"];

/**
 * Heuristic only — oauth2/openIdConnect schemes don't declare their token endpoint in a way
 * that maps to a REST operation, so we guess from common path suffixes. Callers must still
 * verify the result; a miss is surfaced as a "TODO-set-login-path" stub, not an error.
 */
function guessLoginPath(operations: Map<string, { pathTemplate: string; method: string }>): string | undefined {
  for (const op of operations.values()) {
    const lower = op.pathTemplate.toLowerCase();
    if (LOGIN_PATH_HINTS.some((hint) => lower.endsWith(hint)) && op.method === "post") {
      return op.pathTemplate;
    }
  }
  return undefined;
}

function roleNameFor(schemeName: string): string {
  return schemeName.replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * `apitest init`: scaffolds apitest.config.ts + environments/dev.env.example from a spec.
 *
 * Auth handling is best-effort per security scheme, not all-or-nothing:
 *   - bearer / basic / apiKey-in-header  -> fully working AuthRoleConfig + env vars
 *   - apiKey-in-query                    -> can't be auto-configured; logged as a note
 *   - oauth2 / openIdConnect             -> stubbed as bearer-login, with the login path
 *                                            guessed by `guessLoginPath`; logged as a note
 *                                            to verify by hand
 *   - anything else                      -> logged as a note, no config emitted
 * Unsupported schemes get a note instead of failing, so init always produces a usable
 * (if incomplete) config rather than aborting on the first exotic scheme.
 */
export async function runInit(options: InitOptions): Promise<void> {
  console.log(`Fetching and parsing spec from ${options.spec} ...`);
  const spec = await loadSpec(options.spec);
  console.log(`Parsed ${spec.operations.size} operation(s), ${Object.keys(spec.securitySchemes).length} security scheme(s).`);

  const roles: Record<string, AuthRoleConfig> = {};
  const envVars: string[] = [];
  const notes: string[] = [];

  for (const [schemeName, schemeRaw] of Object.entries(spec.securitySchemes)) {
    const scheme = schemeRaw as { type?: string; scheme?: string; in?: string; name?: string };
    const role = roleNameFor(schemeName);

    if (scheme.type === "http" && scheme.scheme === "bearer") {
      const tokenVar = `${role.toUpperCase()}_TOKEN`;
      roles[role] = { kind: "bearer-token", tokenVar };
      envVars.push(tokenVar);
    } else if (scheme.type === "http" && scheme.scheme === "basic") {
      const usernameVar = `${role.toUpperCase()}_USERNAME`;
      const passwordVar = `${role.toUpperCase()}_PASSWORD`;
      roles[role] = { kind: "basic", usernameVar, passwordVar };
      envVars.push(usernameVar, passwordVar);
    } else if (scheme.type === "apiKey") {
      if (scheme.in === "query") {
        notes.push(`Security scheme "${schemeName}" is an apiKey passed in the query string — not auto-configurable. Use a custom auth strategy (kind: "custom").`);
        continue;
      }
      const keyVar = `${role.toUpperCase()}_API_KEY`;
      roles[role] = { kind: "api-key", headerName: scheme.name ?? "X-API-Key", keyVar };
      envVars.push(keyVar);
    } else if (scheme.type === "oauth2" || scheme.type === "openIdConnect") {
      const usernameVar = `${role.toUpperCase()}_USERNAME`;
      const passwordVar = `${role.toUpperCase()}_PASSWORD`;
      const guessedLogin = guessLoginPath(spec.operations as unknown as Map<string, { pathTemplate: string; method: string }>);
      roles[role] = {
        kind: "bearer-login",
        loginPath: guessedLogin ?? "/TODO-set-login-path",
        usernameVar,
        passwordVar,
        tokenPath: "$.access_token",
      };
      envVars.push(usernameVar, passwordVar);
      notes.push(
        `Security scheme "${schemeName}" is ${scheme.type} — not auto-configurable end to end. ` +
          `Stubbed a bearer-login role "${role}" with loginPath ${guessedLogin ? `guessed as "${guessedLogin}"` : `left as a TODO`}; verify tokenPath "$.access_token" against your real login response.`
      );
    } else {
      notes.push(`Security scheme "${schemeName}" (type "${scheme.type}") has no auto-configuration — add it by hand if needed.`);
    }
  }

  if (Object.keys(spec.securitySchemes).length === 0) {
    notes.push("Spec declares no securitySchemes — emitted an empty auth.roles table.");
  }

  const indent = (json: string, spaces: number) =>
    json
      .split("\n")
      .map((line, i) => (i === 0 ? line : " ".repeat(spaces) + line))
      .join("\n");

  const configContent = `/** @type {import("@assertquest/specpilot/config").ApiTestConfig} */
export default {
  spec: ${JSON.stringify(options.spec)},
  baseUrlVar: "BASE_URL",
  auth: {
    roles: ${indent(JSON.stringify(roles, null, 2), 4)},
  },
  db: {
    connections: {},
  },
};
`;
  fs.writeFileSync("apitest.config.ts", configContent, "utf-8");
  console.log("Wrote apitest.config.ts");

  const envLines = [
    "# Copy to dev.env (git-ignored) and fill in real values. Never commit real secrets.",
    `BASE_URL=${spec.servers[0] ?? ""}`,
    ...envVars.map((v) => `${v}=`),
  ];
  fs.mkdirSync("environments", { recursive: true });
  fs.writeFileSync(path.join("environments", "dev.env.example"), envLines.join("\n") + "\n", "utf-8");
  console.log("Wrote environments/dev.env.example");

  if (notes.length > 0) {
    console.log("\nNotes:");
    for (const n of notes) console.log(`  - ${n}`);
  }

  console.log(
    `\nNext: run "apitest sync" to cache the spec, then "apitest check" — it should pass with zero scenarios authored yet.\n` +
      `Run "apitest schema" for YAML IntelliSense on scenario files (add a .vscode/settings.json yaml.schemas entry, or a ` +
      `"# yaml-language-server: $schema=..." comment at the top of each file — see the README).`
  );
}
