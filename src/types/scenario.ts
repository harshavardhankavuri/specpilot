export interface AssertionSpec {
  status?: number;
  jsonpath?: string;
  header?: string; // response header name (case-insensitive); uses the same operators as jsonpath
  equals?: unknown;
  contains?: unknown;
  exists?: boolean;
  // Edge-case operators for the value at `jsonpath`, beyond equals/contains/exists.
  matches?: string; // regex tested against the value coerced to a string
  oneOf?: unknown[]; // value must deep-equal one of these
  minLength?: number; // string length or array length >= this
  maxLength?: number; // string length or array length <= this
  greaterThan?: number;
  lessThan?: number;
  greaterThanOrEqual?: number;
  lessThanOrEqual?: number;
  // Raw-body checks for non-JSON responses (PDFs, CSV exports, etc.) — operate on
  // the response's actual bytes rather than a parsed body, since those don't parse as JSON.
  bodyStartsWith?: string; // magic-bytes / prefix check, matched byte-for-byte (latin1)
  bodyMinBytes?: number;
  bodyMaxBytes?: number;
  db?: string;
  query?: string;
  params?: unknown[];
  expectRow?: Record<string, unknown>;
}

export interface ScenarioStep {
  name?: string;
  operation?: string;
  custom?: string;
  auth?: string | "none";
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  body?: unknown;
  extract?: Record<string, string>;
  assert?: AssertionSpec[];
}

export interface ScenarioDbHooks {
  connection?: string;
  seed?: string;
  rollback?: boolean;
}

export interface ScenarioCase {
  name: string;
  steps: ScenarioStep[];
}

export interface ScenarioFile {
  name: string;
  tags?: string[];
  auth?: string;
  db?: ScenarioDbHooks;
  steps?: ScenarioStep[];
  cases?: ScenarioCase[];
  // Name of a customSteps/*.ts export that always runs after the steps/case,
  // pass or fail — for teardown that must happen even when an assertion fails.
  cleanup?: string;
  sourceFile: string;
}
