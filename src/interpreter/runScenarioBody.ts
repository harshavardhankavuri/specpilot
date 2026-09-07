import { test } from "@playwright/test";
import type { ScenarioStep } from "../types/scenario.js";
import { runStep, type StepRunContext } from "./runStep.js";
import { getCustomStep, loadCustomSteps } from "./customStepRegistry.js";
import type { StepContext } from "../types/customStep.js";

/**
 * Runs a scenario's (or case's) steps in order, then always runs the named
 * `cleanup` custom step afterward — pass or fail — like a finally block. Without
 * this, a cleanup step placed last in `steps:` only runs on the happy path,
 * since a thrown assertion partway through otherwise skips everything after it.
 *
 * If both the main flow and cleanup fail, the main flow's error is what fails
 * the test (it's the real cause); the cleanup failure is logged, not swallowed,
 * but doesn't override the primary failure reason.
 */
export async function runScenarioBody(
  steps: ScenarioStep[],
  ctx: StepRunContext,
  cleanup: string | undefined,
  // Base path of `steps` within the source YAML (e.g. ["steps"] or ["cases", 2, "steps"]),
  // set only in record mode so each step's captured response can be traced back to it.
  recordBasePath?: (string | number)[]
): Promise<void> {
  let failure: unknown;

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepCtx = recordBasePath ? { ...ctx, recordPath: [...recordBasePath, i] } : ctx;
      await test.step(step.name ?? step.operation ?? step.custom ?? "step", async () => {
        await runStep(step, stepCtx);
      });
    }
  } catch (err) {
    failure = err;
  }

  if (cleanup) {
    try {
      await test.step(`cleanup: ${cleanup}`, async () => {
        const registry = await loadCustomSteps();
        const fn = getCustomStep(registry, cleanup);
        const stepCtx: StepContext = {
          request: ctx.request,
          roleRequest: ctx.roleRequest,
          spec: ctx.spec,
          db: ctx.db,
          vars: ctx.vars,
          defaultAuth: ctx.defaultAuth,
        };
        await fn(stepCtx);
      });
    } catch (cleanupErr) {
      if (failure === undefined) {
        failure = cleanupErr;
      } else {
        console.error(`Cleanup step "${cleanup}" also failed (original failure takes priority):`, cleanupErr);
      }
    }
  }

  if (failure !== undefined) throw failure;
}
