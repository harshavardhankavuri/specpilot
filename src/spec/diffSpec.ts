import type { JsonSchema, OperationDescriptor } from "./loadSpec.js";
import { resolveSchema } from "./resolveSchema.js";

export interface OperationChange {
  operationId: string;
  breaking: boolean;
  detail: string;
}

export interface SpecDrift {
  /** operationIds present in `after` but not `before`. */
  added: string[];
  /** operationIds present in `before` but not `after` — any scenario step referencing one of
   *  these will fail `apitest check`/`apitest run` until the scenario is updated. */
  removed: string[];
  /** Operations present in both, but with a shape change worth a human's attention. */
  changed: OperationChange[];
}

function diffRequestBody(before: OperationDescriptor, after: OperationDescriptor, changes: OperationChange[]): void {
  const beforeSchema = resolveSchema(before.requestBodySchema);
  const afterSchema = resolveSchema(after.requestBodySchema);
  if (!beforeSchema && !afterSchema) return;

  if (!beforeSchema && afterSchema) {
    changes.push({ operationId: after.operationId, breaking: true, detail: "now requires a request body (previously had none)." });
    return;
  }
  if (beforeSchema && !afterSchema) {
    changes.push({ operationId: after.operationId, breaking: false, detail: "no longer takes a request body." });
    return;
  }

  const beforeRequired = new Set((beforeSchema!.required as string[] | undefined) ?? []);
  const afterRequired = new Set((afterSchema!.required as string[] | undefined) ?? []);

  for (const field of afterRequired) {
    if (!beforeRequired.has(field)) {
      changes.push({
        operationId: after.operationId,
        breaking: true,
        detail: `request body field "${field}" is now required — existing scenario bodies that omit it will start getting 400s.`,
      });
    }
  }
  for (const field of beforeRequired) {
    if (!afterRequired.has(field)) {
      changes.push({
        operationId: after.operationId,
        breaking: false,
        detail: `request body field "${field}" is no longer required.`,
      });
    }
  }

  const beforeProps = (beforeSchema!.properties as Record<string, JsonSchema> | undefined) ?? {};
  const afterProps = (afterSchema!.properties as Record<string, JsonSchema> | undefined) ?? {};
  for (const [field, afterProp] of Object.entries(afterProps)) {
    const beforeProp = beforeProps[field];
    if (!beforeProp) continue;
    if (beforeProp.type && afterProp.type && beforeProp.type !== afterProp.type) {
      changes.push({
        operationId: after.operationId,
        breaking: true,
        detail: `request body field "${field}" changed type: ${beforeProp.type} -> ${afterProp.type}.`,
      });
    }
  }
}

function diffResponses(before: OperationDescriptor, after: OperationDescriptor, changes: OperationChange[]): void {
  const beforeStatuses = new Set(Object.keys(before.responses));
  const afterStatuses = new Set(Object.keys(after.responses));

  for (const status of afterStatuses) {
    if (!beforeStatuses.has(status)) {
      changes.push({ operationId: after.operationId, breaking: false, detail: `now documents a ${status} response (new).` });
    }
  }
  for (const status of beforeStatuses) {
    if (!afterStatuses.has(status)) {
      changes.push({
        operationId: after.operationId,
        breaking: true,
        detail: `no longer documents the ${status} response — a scenario asserting "status: ${status}" for this operation will fail the automatic "documented response" check.`,
      });
    }
  }
}

function diffOperation(before: OperationDescriptor, after: OperationDescriptor): OperationChange[] {
  const changes: OperationChange[] = [];

  if (before.method !== after.method) {
    changes.push({
      operationId: after.operationId,
      breaking: true,
      detail: `HTTP method changed: ${before.method.toUpperCase()} -> ${after.method.toUpperCase()}.`,
    });
  }
  if (before.pathTemplate !== after.pathTemplate) {
    changes.push({
      operationId: after.operationId,
      breaking: true,
      detail: `path changed: ${before.pathTemplate} -> ${after.pathTemplate}.`,
    });
  }

  const beforePathParams = new Set(before.pathParams);
  const afterPathParams = new Set(after.pathParams);
  for (const p of afterPathParams) {
    if (!beforePathParams.has(p)) {
      changes.push({ operationId: after.operationId, breaking: true, detail: `new path param "{${p}}" — existing scenario steps must add it to \`params:\`.` });
    }
  }
  for (const p of beforePathParams) {
    if (!afterPathParams.has(p)) {
      changes.push({ operationId: after.operationId, breaking: false, detail: `path param "{${p}}" removed.` });
    }
  }

  const beforeReqQuery = new Set(before.requiredQueryParams);
  const afterReqQuery = new Set(after.requiredQueryParams);
  for (const q of afterReqQuery) {
    if (!beforeReqQuery.has(q)) {
      changes.push({
        operationId: after.operationId,
        breaking: true,
        detail: `query param "${q}" is now required — existing scenario steps that don't set it in \`query:\` will start failing.`,
      });
    }
  }
  for (const q of beforeReqQuery) {
    if (!afterReqQuery.has(q)) {
      changes.push({ operationId: after.operationId, breaking: false, detail: `query param "${q}" is no longer required.` });
    }
  }

  diffRequestBody(before, after, changes);
  diffResponses(before, after, changes);

  return changes;
}

export function diffSpec(before: Map<string, OperationDescriptor>, after: Map<string, OperationDescriptor>): SpecDrift {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: OperationChange[] = [];

  for (const id of after.keys()) {
    if (!before.has(id)) added.push(id);
  }
  for (const id of before.keys()) {
    if (!after.has(id)) removed.push(id);
  }
  for (const [id, beforeOp] of before) {
    const afterOp = after.get(id);
    if (afterOp) changed.push(...diffOperation(beforeOp, afterOp));
  }

  return { added: added.sort(), removed: removed.sort(), changed };
}
