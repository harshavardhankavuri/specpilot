// Scaffolds a new apitest project with one small, zero-credential example (list posts against
// jsonplaceholder.typicode.com) that runs immediately after `npm install` — mirroring how
// `npm init playwright` generates a runnable example rather than an empty project.
import fs from "node:fs";
import path from "node:path";

const targetDir = process.argv[2];
if (!targetDir) {
  console.error("Usage: npx create-apitest <directory>");
  process.exit(1);
}

const abs = path.resolve(targetDir);
if (fs.existsSync(abs) && fs.readdirSync(abs).length > 0) {
  console.error(`Directory "${abs}" already exists and is not empty.`);
  process.exit(1);
}
fs.mkdirSync(abs, { recursive: true });

const pkg = {
  name: path.basename(abs),
  version: "0.0.1",
  private: true,
  type: "module",
  scripts: {
    "apitest:sync": "apitest sync",
    "apitest:check": "apitest check",
    "apitest:run": "apitest run",
  },
  dependencies: {
    "@assertquest/specpilot": "^0.1.0",
  },
  devDependencies: {
    "@playwright/test": "^1.47.0",
  },
};

fs.writeFileSync(path.join(abs, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf-8");

for (const dir of ["customSteps", "seeds", "environments"]) {
  fs.mkdirSync(path.join(abs, dir), { recursive: true });
  fs.writeFileSync(path.join(abs, dir, ".gitkeep"), "", "utf-8");
}
fs.mkdirSync(path.join(abs, "scenarios"), { recursive: true });

// A minimal, hand-written OpenAPI doc for jsonplaceholder.typicode.com (it doesn't publish its
// own spec) — just enough for the one baked-in example scenario below.
const openapiSpec = {
  openapi: "3.0.3",
  info: { title: "JSONPlaceholder (example)", version: "1.0.0" },
  servers: [{ url: "https://jsonplaceholder.typicode.com" }],
  paths: {
    "/posts": {
      get: {
        operationId: "listPosts",
        summary: "List posts",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      userId: { type: "integer" },
                      id: { type: "integer" },
                      title: { type: "string" },
                      body: { type: "string" },
                    },
                    required: ["userId", "id", "title", "body"],
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
fs.writeFileSync(path.join(abs, "openapi.json"), JSON.stringify(openapiSpec, null, 2) + "\n", "utf-8");

fs.writeFileSync(
  path.join(abs, "apitest.config.ts"),
  `/** @type {import("@assertquest/specpilot/config").ApiTestConfig} */\nexport default {\n  spec: "./openapi.json",\n};\n`,
  "utf-8"
);

fs.writeFileSync(
  path.join(abs, "playwright.config.ts"),
  `import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The one generic spec file lives in the @assertquest/specpilot package, not this project.
const specFile = fileURLToPath(import.meta.resolve("@assertquest/specpilot/runtime/scenario.spec.ts"));

export default defineConfig({
  testDir: path.dirname(specFile),
  testMatch: "scenario.spec.ts",
  fullyParallel: true,
  reporter: [["list"]],
});
`,
  "utf-8"
);

fs.writeFileSync(
  path.join(abs, "scenarios", "example.scenario.yaml"),
  `name: list-posts
tags: [smoke]
steps:
  - name: list posts
    operation: listPosts
    assert:
      - status: 200
`,
  "utf-8"
);

fs.writeFileSync(
  path.join(abs, ".gitignore"),
  ["node_modules/", ".spec-cache/", "test-results/", "playwright-report/", "environments/*.env", "!environments/*.env.example"].join("\n") + "\n",
  "utf-8"
);

fs.writeFileSync(
  path.join(abs, "README.md"),
  `# ${pkg.name}

Scaffolded by create-apitest, with one working example (\`scenarios/example.scenario.yaml\`)
against jsonplaceholder.typicode.com — runs with no credentials needed.

1. \`npm install\`
2. \`npx apitest sync\`
3. \`npx apitest check\`
4. \`npx apitest run\`

Point this project at your own API instead:

1. \`npx apitest init --spec <your-openapi-spec-url-or-path>\` (overwrites \`apitest.config.ts\`)
2. Delete \`scenarios/example.scenario.yaml\` and \`openapi.json\`
3. Author scenarios under \`scenarios/\`, then repeat steps 2-4 above
`,
  "utf-8"
);

console.log(`Created an apitest project in ${abs} with one runnable example scenario.`);
console.log(`Next: cd ${targetDir} && npm install && npx apitest sync && npx apitest check && npx apitest run`);
