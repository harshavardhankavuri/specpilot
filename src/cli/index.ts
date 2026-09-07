// CLI entry point: defines every `apitest <subcommand>` via commander, delegating
// each to its handler in src/cli/*.ts, then parses process.argv to dispatch.
// Invoked through bin/apitest.js, which registers tsx so this runs without a build step.
import { Command } from "commander";
import { runSync } from "./sync.js";
import { runDrift } from "./drift.js";
import { runDigest } from "./digest.js";
import { runDescribe } from "./describe.js";
import { runCheck } from "./check.js";
import { runTests } from "./run.js";
import { runAddAssertions } from "./addAssertions.js";
import { runInit } from "./init.js";
import { runImport } from "./import.js";
import { runDbIntrospect } from "./dbIntrospect.js";
import { generateScenarioJsonSchema } from "./schema.js";
import { loadEnvFile } from "./loadConfig.js";

const program = new Command();
program.name("apitest").description("Contract-first, generic API test framework on Playwright").version("0.1.0");

program
  .command("init")
  .description("Derive apitest.config.ts and an env example from an OpenAPI spec")
  .requiredOption("--spec <specUrlOrPath>", "URL or path to the OpenAPI 3.x spec")
  .action(async (opts) => {
    await runInit({ spec: opts.spec });
  });

program
  .command("sync")
  .description("Fetch and cache the OpenAPI spec (required before run/check)")
  .action(async () => {
    await runSync();
  });

program
  .command("drift")
  .description(
    "Fetch the live spec and diff it against .spec-cache/, summarizing breaking vs. informational changes and which scenarios reference each affected operation"
  )
  .option("--sync", "after reporting, write the live spec into .spec-cache/ (equivalent to running sync afterward)")
  .action(async (opts) => {
    const code = await runDrift({ sync: opts.sync });
    process.exitCode = code;
  });

program
  .command("digest")
  .description(
    "Summarize the most recent Allure run (allure-results/) into a plain-English pass/fail digest, split into new vs. persistent vs. newly-fixed failures. Reads only local Allure JSON — no network calls, no credentials."
  )
  .option("--dir <path>", "Allure results directory", "allure-results")
  .action(async (opts) => {
    const code = await runDigest({ dir: opts.dir });
    process.exitCode = code;
  });

program
  .command("describe <operationIds...>")
  .description(
    "Print a compact human-readable summary (method/path/params/body constraints/documented responses) for one or more synced operationIds — no need to grep .spec-cache/spec.json by hand"
  )
  .action(async (operationIds: string[]) => {
    const code = await runDescribe({ operationIds });
    process.exitCode = code;
  });

program
  .command("check")
  .description("Validate every scenario references real operationIds/params, without executing anything")
  .action(async () => {
    const code = await runCheck();
    process.exitCode = code;
  });

program
  .command("run")
  .description("Run scenarios via Playwright")
  .option("--env <name>", "environment name (loads environments/<name>.env)", "dev")
  .option("--tag <tag>", "only run scenarios/cases tagged with this tag")
  .option("--dry-run", "print the resolved plan for each step without sending requests")
  .action(async (opts) => {
    const code = await runTests({ env: opts.env, tag: opts.tag, dryRun: opts.dryRun });
    process.exitCode = code;
  });

program
  .command("add-assertions <file>")
  .description(
    "Run one scenario/cases file live and append assert: entries generated from its actual responses"
  )
  .option("--env <name>", "environment name (loads environments/<name>.env)", "dev")
  .option("--dry-run", "print the resulting file without writing it")
  .action(async (file, opts) => {
    const code = await runAddAssertions({ file, env: opts.env, dryRun: opts.dryRun });
    process.exitCode = code;
  });

program
  .command("import")
  .description("Scaffold *.scenario.yaml stubs from the spec, one file per tag (never run automatically by init)")
  .action(async () => {
    await runImport();
  });

program
  .command("schema")
  .description("Regenerate the JSON Schema used for scenario YAML IntelliSense (schemas/scenario.schema.json)")
  .action(() => {
    generateScenarioJsonSchema();
  });

const db = program.command("db:introspect").description("Generate typed row interfaces from a db connection's schema");
db.requiredOption("--connection <name>", "connection name from apitest.config.ts db.connections")
  .option("--out <file>", "output .ts file")
  .option("--env <name>", "environment name (loads environments/<name>.env)", "dev")
  .action(async (opts) => {
    await runDbIntrospect({ connection: opts.connection, out: opts.out, env: opts.env });
  });

// Every command below `init` needs env vars loaded for spec/db access.
loadEnvFile(process.env.APITEST_ENV ?? "dev");

await program.parseAsync(process.argv);
