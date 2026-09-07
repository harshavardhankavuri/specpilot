import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocument, isMap, isSeq, YAMLSeq } from "yaml";
import { scenarioFileSchema } from "../schema/scenarioSchema.js";
import type { AssertionSpec, ScenarioFile, ScenarioStep } from "../types/scenario.js";
import type { RecordedResult } from "../interpreter/runStep.js";
import { spawnAsync } from "./run.js";

export interface AddAssertionsOptions {
  file: string;
  env?: string;
  dryRun?: boolean;
}

// Field-name / value heuristics for "this looks like it changes every request,
// so assert presence rather than an exact value that will go stale immediately."
const VOLATILE_KEY = /(^id$|Id$|_id$|uuid|token|secret|nonce)/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksVolatile(key: string, value: unknown): boolean {
  if (VOLATILE_KEY.test(key)) return true;
  return typeof value === "string" && (ISO_DATE.test(value) || UUID.test(value));
}

const MAX_ASSERTIONS_PER_STEP = 25;
const MAX_DEPTH = 6;

type GeneratedAssertion = { jsonpath: string } & Partial<AssertionSpec>;

/**
 * Walks a captured JSON body and proposes one assertion per leaf field, skipping
 * any jsonpath the scenario author already asserted on by hand (their assertion
 * wins, whatever operator they chose).
 */
function buildAssertions(
  value: unknown,
  jsonpath: string,
  lastKey: string,
  existingPaths: Set<string>,
  out: GeneratedAssertion[],
  depth: number
): void {
  if (out.length >= MAX_ASSERTIONS_PER_STEP || depth > MAX_DEPTH) return;

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      buildAssertions(v, `${jsonpath}.${k}`, k, existingPaths, out, depth + 1);
    }
    return;
  }

  if (existingPaths.has(jsonpath)) return;

  if (Array.isArray(value)) {
    out.push(value.length === 0 ? { jsonpath, equals: [] } : { jsonpath, minLength: value.length });
    return;
  }
  if (value === null) {
    out.push({ jsonpath, equals: null });
    return;
  }
  if (typeof value === "string" && looksVolatile(lastKey, value)) {
    out.push({ jsonpath, exists: true });
    return;
  }
  out.push({ jsonpath, equals: value as AssertionSpec["equals"] });
}

function getStepAtPath(scenario: ScenarioFile, stepPath: (string | number)[]): ScenarioStep | undefined {
  if (stepPath[0] === "steps") return scenario.steps?.[stepPath[1] as number];
  if (stepPath[0] === "cases") return scenario.cases?.[stepPath[1] as number]?.steps[stepPath[3] as number];
  return undefined;
}

function countCustomSteps(scenario: ScenarioFile): number {
  const all = [...(scenario.steps ?? []), ...(scenario.cases ?? []).flatMap((c) => c.steps)];
  return all.filter((s) => s.custom).length;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function runAddAssertions(options: AddAssertionsOptions): Promise<number> {
  const absFile = path.resolve(options.file);
  if (!fs.existsSync(absFile)) {
    console.error(`Scenario file not found: ${absFile}`);
    return 1;
  }

  const raw = fs.readFileSync(absFile, "utf-8");
  const doc = parseDocument(raw);
  const result = scenarioFileSchema.safeParse(doc.toJS());
  if (!result.success) {
    console.error(`Invalid scenario file ${absFile}:`);
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return 1;
  }
  const scenario: ScenarioFile = { ...result.data, sourceFile: absFile };

  const customCount = countCustomSteps(scenario);
  if (customCount > 0) {
    console.log(
      `Note: ${customCount} custom: step(s) will execute normally for chaining, but won't get generated ` +
        `assertions — assert: only applies to operation steps.`
    );
  }

  const recordFile = path.join(os.tmpdir(), `apitest-record-${Date.now()}-${process.pid}.jsonl`);
  fs.writeFileSync(recordFile, "");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    APITEST_ENV: options.env ?? "dev",
    APITEST_RECORD_TARGET: absFile,
    APITEST_RECORD_FILE: recordFile,
  };

  console.log(`Running "${scenario.name}" live against env "${options.env ?? "dev"}" to record real responses...`);
  const exitCode = await spawnAsync("npx", ["playwright", "test", "--grep", escapeRegex(scenario.name)], env);

  let recorded: RecordedResult[] = [];
  try {
    recorded = fs
      .readFileSync(recordFile, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RecordedResult);
  } finally {
    fs.rmSync(recordFile, { force: true });
  }

  if (recorded.length === 0) {
    console.error(
      `No responses recorded (exit code ${exitCode}) — the run likely failed before reaching any operation ` +
        `step. Check the Playwright output above (e.g. auth/env misconfiguration).`
    );
    return exitCode || 1;
  }

  let totalAdded = 0;
  let totalStepsTouched = 0;
  for (const rec of recorded) {
    const step = getStepAtPath(scenario, rec.stepPath);
    if (!step?.operation) continue; // shouldn't happen — recording only fires for operation steps

    if (rec.body === undefined) {
      console.log(`  [skip] ${rec.operationId} (${rec.stepPath.join(".")}) — response body isn't JSON.`);
      continue;
    }

    const existingPaths = new Set(
      (step.assert ?? []).filter((a) => a.jsonpath !== undefined).map((a) => a.jsonpath!)
    );
    const generated: GeneratedAssertion[] = [];
    buildAssertions(rec.body, "$", "", existingPaths, generated, 0);
    if (generated.length === 0) continue;

    const stepNode = doc.getIn(rec.stepPath);
    if (!isMap(stepNode)) continue;
    const existingSeq = stepNode.get("assert", true);
    let assertSeq: YAMLSeq;
    if (isSeq(existingSeq)) {
      assertSeq = existingSeq;
    } else {
      assertSeq = new YAMLSeq(doc.schema);
      stepNode.set("assert", assertSeq);
    }
    for (const g of generated) assertSeq.add(doc.createNode(g));

    totalAdded += generated.length;
    totalStepsTouched += 1;
    console.log(`  [+${generated.length}] ${rec.operationId} (status ${rec.status}) at ${rec.stepPath.join(".")}`);
  }

  if (totalAdded === 0) {
    console.log("No new assertions to add — every observed field already has a hand-authored assertion.");
    return 0;
  }

  if (options.dryRun) {
    console.log(`\nDry run — would add ${totalAdded} assertion(s) across ${totalStepsTouched} step(s). File not written.`);
    console.log("\n--- resulting file ---\n");
    console.log(doc.toString());
    return 0;
  }

  fs.writeFileSync(absFile, doc.toString(), "utf-8");
  console.log(
    `\nAdded ${totalAdded} assertion(s) across ${totalStepsTouched} step(s) to ${path.relative(process.cwd(), absFile)}.\n` +
      `Review the diff before committing — these encode whatever the live API returned just now, not necessarily ` +
      `what it *should* return. Run "apitest check" then "apitest run" to confirm they pass.`
  );
  return 0;
}
