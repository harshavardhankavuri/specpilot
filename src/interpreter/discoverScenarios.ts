import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { scenarioFileSchema } from "../schema/scenarioSchema.js";
import type { ScenarioFile } from "../types/scenario.js";

function walk(dir: string, matcher: RegExp, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, matcher, out);
    else if (matcher.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Synchronous by necessity: Playwright must finish registering `test()` calls
 * before any async work happens, so scenario files are read+validated up front.
 */
export function discoverScenarios(scenariosDir = "scenarios"): ScenarioFile[] {
  const files = [
    ...walk(scenariosDir, /\.scenario\.ya?ml$/),
    ...walk(scenariosDir, /\.cases\.ya?ml$/),
  ];

  const scenarios: ScenarioFile[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8");
    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch (err) {
      throw new Error(`Failed to parse YAML in ${file}: ${(err as Error).message}`);
    }
    const result = scenarioFileSchema.safeParse(parsed);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n");
      throw new Error(`Invalid scenario file ${file}:\n${details}`);
    }
    scenarios.push({ ...result.data, sourceFile: file });
  }
  return scenarios;
}
