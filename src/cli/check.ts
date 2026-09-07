import { loadConfig } from "./loadConfig.js";
import { readSpecCache } from "../spec/loadSpec.js";
import { discoverScenarios } from "../interpreter/discoverScenarios.js";
import type { ScenarioFile, ScenarioStep } from "../types/scenario.js";
import fs from "node:fs";

interface CheckIssue {
  file: string;
  message: string;
}

function checkStep(step: ScenarioStep, file: string, spec: ReturnType<typeof readSpecCache>["operations"], issues: CheckIssue[]): void {
  if (step.custom) {
    const modPath = `customSteps/${step.custom}.ts`;
    // Custom steps are matched by export name at runtime, not filename, so we only
    // warn (not fail) if no file under customSteps/ looks like it could contain it.
    if (fs.existsSync("customSteps") && fs.readdirSync("customSteps").length === 0) {
      issues.push({ file, message: `step references custom step "${step.custom}" but customSteps/ is empty.` });
    }
    return;
  }
  const op = spec.get(step.operation!);
  if (!op) {
    issues.push({
      file,
      message: `references unknown operationId "${step.operation}" — not found in the synced spec. Run "apitest sync" if the API changed, or fix the scenario.`,
    });
    return;
  }
  const providedParams = new Set(Object.keys(step.params ?? {}));
  for (const p of op.pathParams) {
    if (!providedParams.has(p) && !JSON.stringify(step.params ?? {}).includes("{{")) {
      issues.push({ file, message: `step for operation "${step.operation}" is missing required path param "${p}".` });
    }
  }
}

export async function runCheck(): Promise<number> {
  const config = await loadConfig();
  const spec = readSpecCache(config.specCacheDir).operations;
  const scenarios: ScenarioFile[] = discoverScenarios(config.scenariosDir);

  const issues: CheckIssue[] = [];
  for (const scenario of scenarios) {
    for (const step of scenario.steps ?? []) checkStep(step, scenario.sourceFile, spec, issues);
    for (const c of scenario.cases ?? []) {
      for (const step of c.steps) checkStep(step, scenario.sourceFile, spec, issues);
    }
  }

  if (issues.length === 0) {
    console.log(`spec loaded, ${spec.size} operations found, ${scenarios.length} scenario file(s) validated, 0 issues.`);
    return 0;
  }

  console.error(`Found ${issues.length} issue(s):`);
  for (const issue of issues) console.error(`  ${issue.file}: ${issue.message}`);
  return 1;
}
