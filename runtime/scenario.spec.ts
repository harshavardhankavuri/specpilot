// The ONE checked-in Playwright spec file. It never changes per target API —
// it interprets scenario data discovered at collection time. See §6.1 of the design.
import path from "node:path";
import fs from "node:fs";
import { test } from "../src/fixtures/apiTest.js";
import { discoverScenarios } from "../src/interpreter/discoverScenarios.js";
import { runScenarioBody } from "../src/interpreter/runScenarioBody.js";
import type { RecordedResult } from "../src/interpreter/runStep.js";

// `apitest add-assertions` runs this same spec against a single scenario file,
// in record mode, so it can generate assertions from real responses instead of
// duplicating request/auth/chaining logic in a separate script.
const recordTarget = process.env.APITEST_RECORD_TARGET;
const recordOutFile = process.env.APITEST_RECORD_FILE;
const onRecord = recordOutFile
  ? (result: RecordedResult) => fs.appendFileSync(recordOutFile, JSON.stringify(result) + "\n")
  : undefined;

let scenarios = discoverScenarios();
if (recordTarget) {
  const targetAbs = path.resolve(recordTarget);
  scenarios = scenarios.filter((s) => path.resolve(s.sourceFile) === targetAbs);
}

for (const scenario of scenarios) {
  test.describe(scenario.name, () => {
    if (scenario.steps) {
      test(scenario.name, { tag: (scenario.tags ?? []).map((t) => `@${t}`) }, async ({
        request,
        roleRequest,
        spec,
        db,
      }) => {
        const vars: Record<string, unknown> = {};
        await runScenarioBody(
          scenario.steps!,
          {
            request,
            roleRequest,
            spec,
            db,
            vars,
            defaultAuth: scenario.auth,
            dryRun: process.env.APITEST_DRY_RUN === "true",
            recordMode: !!recordOutFile,
            onRecord,
          },
          scenario.cleanup,
          recordOutFile ? ["steps"] : undefined
        );
      });
    }

    scenario.cases?.forEach((c, caseIndex) => {
      test(c.name, { tag: (scenario.tags ?? []).map((t) => `@${t}`) }, async ({ request, roleRequest, spec, db }) => {
        const vars: Record<string, unknown> = {};
        await runScenarioBody(
          c.steps,
          {
            request,
            roleRequest,
            spec,
            db,
            vars,
            defaultAuth: scenario.auth,
            dryRun: process.env.APITEST_DRY_RUN === "true",
            recordMode: !!recordOutFile,
            onRecord,
          },
          scenario.cleanup,
          recordOutFile ? ["cases", caseIndex, "steps"] : undefined
        );
      });
    });
  });
}
