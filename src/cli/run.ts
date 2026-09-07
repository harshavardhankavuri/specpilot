import { spawn } from "node:child_process";

export interface RunOptions {
  env?: string;
  tag?: string;
  dryRun?: boolean;
}

// With `shell: true`, Node hands args straight to the shell without quoting them
// (see the DEP0190 warning) — a plain space-joined argv breaks any arg containing
// a space (e.g. `--grep "Health check"` becomes two argv tokens). Quote anything
// that needs it ourselves.
function quoteArgForShell(arg: string): string {
  if (/^[\w.\-/@:{}]+$/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

export function spawnAsync(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args.map(quoteArgForShell), { stdio: "inherit", env, shell: true });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/**
 * Generates a single self-contained HTML file from the Allure results collected
 * by the allure-playwright reporter. Runs after every `apitest run`, pass or fail,
 * so the report always reflects the latest execution. Requires the `allure`
 * command to be on PATH (ships via the `allure-commandline` npm package) and a
 * Java runtime, per Allure's own requirements.
 */
async function generateAllureReport(env: NodeJS.ProcessEnv): Promise<void> {
  const code = await spawnAsync(
    "npx",
    ["allure", "generate", "allure-results", "--clean", "-o", "allure-report", "--single-file"],
    env
  );
  if (code === 0) {
    console.log("Allure report: allure-report/index.html (single file)");
  } else {
    console.warn(
      "Allure report generation failed — is a Java runtime installed and on PATH? " +
        "(allure-commandline requires Java.) Test results themselves are unaffected."
    );
  }
}

export async function runTests(options: RunOptions): Promise<number> {
  const args = ["playwright", "test"];
  if (options.tag) args.push("--grep", `@${options.tag}`);

  const env: NodeJS.ProcessEnv = { ...process.env, APITEST_ENV: options.env ?? "dev" };
  if (options.dryRun) env.APITEST_DRY_RUN = "true";
  // Node refuses to strip types from .ts files under node_modules, but runtime/scenario.spec.ts
  // lives there once apitest-framework is an installed dependency — register tsx for this
  // subprocess (bin/apitest.js only registers it for the CLI process itself) so Playwright's
  // own native TS loader never has to touch that file.
  // apitest-framework is typically linked via a symlink (npm `file:` dependency). Without
  // --preserve-symlinks, Node resolves modules against the symlink's realpath, which would
  // reach for a physical @playwright/test install alongside the framework's own source instead
  // of the consuming project's copy — tripping Playwright's "second require" guard.
  env.NODE_OPTIONS = [env.NODE_OPTIONS, "--import tsx/esm", "--preserve-symlinks"].filter(Boolean).join(" ");

  const code = await spawnAsync("npx", args, env);

  if (!options.dryRun) {
    await generateAllureReport(env);
  }

  return code;
}
