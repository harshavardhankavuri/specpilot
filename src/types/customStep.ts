import type { APIRequestContext } from "@playwright/test";
import type { DbAdapter } from "../db/DbAdapter.js";

export interface StepContext {
  request: APIRequestContext;
  roleRequest: (role: string) => Promise<APIRequestContext>;
  spec: Map<string, import("../spec/loadSpec.js").OperationDescriptor>;
  db: (connectionName: string) => Promise<DbAdapter>;
  vars: Record<string, unknown>;
  defaultAuth?: string;
}

export type CustomStep = (ctx: StepContext) => Promise<void>;
