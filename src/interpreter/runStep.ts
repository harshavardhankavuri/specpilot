import type { APIRequestContext } from "@playwright/test";
import type { OperationDescriptor } from "../spec/loadSpec.js";
import type { ScenarioStep } from "../types/scenario.js";
import type { DbAdapter } from "../db/DbAdapter.js";
import { buildUrl } from "./buildUrl.js";
import { interpolateDeep } from "../runtime/interpolate.js";
import { attachApiCall } from "./attachApiCall.js";
import { runAutomaticAssertions, runAssertion } from "./runAssertion.js";
import { getCustomStep, loadCustomSteps } from "./customStepRegistry.js";
import type { CustomStep, StepContext } from "../types/customStep.js";
import { jsonPath } from "../runtime/jsonPath.js";

export interface RecordedResult {
  stepPath: (string | number)[];
  operationId: string;
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface StepRunContext {
  request: APIRequestContext;
  roleRequest: (role: string) => Promise<APIRequestContext>;
  spec: Map<string, OperationDescriptor>;
  db: (connectionName: string) => Promise<DbAdapter>;
  vars: Record<string, unknown>;
  defaultAuth?: string;
  dryRun?: boolean;
  // Record mode (used by `apitest add-assertions`): skips the normal assertion
  // pass and instead hands the real response to `onRecord`, keyed by this step's
  // path in the source YAML (e.g. ["steps", 0] or ["cases", 2, "steps", 0]) so the
  // CLI can write generated assertions back to the exact right place.
  recordMode?: boolean;
  recordPath?: (string | number)[];
  onRecord?: (result: RecordedResult) => void;
}

function resolveAuth(stepAuth: string | undefined, defaultAuth: string | undefined): string | undefined {
  if (stepAuth === "none") return undefined;
  return stepAuth ?? defaultAuth;
}

export async function runStep(step: ScenarioStep, ctx: StepRunContext): Promise<void> {
  if (step.custom) {
    const registry = await loadCustomSteps();
    const fn: CustomStep = getCustomStep(registry, step.custom);
    const stepCtx: StepContext = {
      request: ctx.request,
      roleRequest: ctx.roleRequest,
      spec: ctx.spec,
      db: ctx.db,
      vars: ctx.vars,
      defaultAuth: ctx.defaultAuth,
    };
    if (ctx.dryRun) {
      console.log(`[dry-run] custom step: ${step.custom}`);
      return;
    }
    await fn(stepCtx);
    return;
  }

  const op = ctx.spec.get(step.operation!);
  if (!op) {
    throw new Error(
      `Unknown operationId "${step.operation}" — not found in the loaded spec. Run "apitest sync" if the ` +
        `spec changed, or "apitest check" to see every scenario referencing a stale operationId.`
    );
  }

  const effectiveAuth = resolveAuth(step.auth, ctx.defaultAuth);

  if (ctx.dryRun) {
    // A chained step may reference a var an earlier (also dry-run, so never actually
    // sent) step would have `extract`ed. Rather than fail the whole plan on that
    // still-unknown value, print the template literally and flag it as unresolved.
    let planUrl: string;
    let unresolved = false;
    try {
      planUrl = buildUrl(op, step.params, step.query, ctx.vars);
    } catch {
      planUrl = `${op.pathTemplate} (params: ${JSON.stringify(step.params ?? {})}, query: ${JSON.stringify(step.query ?? {})}) [contains values not resolvable in a dry run]`;
      unresolved = true;
    }
    let planBody: unknown = "(none)";
    if (step.body !== undefined) {
      try {
        planBody = JSON.stringify(interpolateDeep(step.body, ctx.vars));
      } catch {
        planBody = `${JSON.stringify(step.body)} [contains values not resolvable in a dry run]`;
        unresolved = true;
      }
    }
    console.log(
      `[dry-run] ${op.method.toUpperCase()} ${planUrl}\n` +
        `  auth: ${effectiveAuth ?? "(none)"}\n` +
        `  body: ${planBody}\n` +
        `  expected: automatic status/schema check for documented responses (${Object.keys(op.responses).join(", ")})` +
        (step.assert?.length ? `\n  extra assertions: ${step.assert.length}` : "") +
        (unresolved ? `\n  note: some values reference vars extracted by an earlier step, which dry-run never executes` : "")
    );
    return;
  }

  const url = buildUrl(op, step.params, step.query, ctx.vars);
  const body = step.body !== undefined ? interpolateDeep(step.body, ctx.vars) : undefined;
  const extraHeaders = step.headers ? (interpolateDeep(step.headers, ctx.vars) as Record<string, string>) : {};

  // roleRequest returns a Playwright APIRequestContext with auth headers already
  // baked in via extraHTTPHeaders, so the actual call only needs to add step-level headers.
  const receiver = effectiveAuth ? await ctx.roleRequest(effectiveAuth) : ctx.request;

  const response = await receiver.fetch(url, {
    method: op.method.toUpperCase(),
    data: body,
    headers: extraHeaders,
  });

  await attachApiCall(op.method, url, body, extraHeaders, response);

  let json: unknown;
  if (ctx.recordMode) {
    json = await response.json().catch(() => undefined);
    ctx.onRecord?.({
      stepPath: ctx.recordPath ?? [],
      operationId: op.operationId,
      status: response.status(),
      body: json,
      headers: response.headers(),
    });
  } else {
    await runAutomaticAssertions(op, response);
    for (const extra of step.assert ?? []) {
      await runAssertion(extra, response, ctx.vars, ctx.db);
    }
  }

  if (step.extract) {
    if (json === undefined) json = await response.json().catch(() => undefined);
    for (const [name, path] of Object.entries(step.extract)) {
      ctx.vars[name] = jsonPath(json, path);
    }
  }
}
