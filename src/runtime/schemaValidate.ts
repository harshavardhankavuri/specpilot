import AjvModule, { type ErrorObject, type Options as AjvOptions } from "ajv";
import addFormatsModule from "ajv-formats";
import type { JsonSchema } from "../spec/loadSpec.js";

// ajv/ajv-formats ship "export =" CJS defaults that TS's NodeNext resolution sees as
// non-constructable/non-callable namespace objects under esModuleInterop — cast through
// unknown to the runtime-accurate callable/constructable shape.
const Ajv = AjvModule as unknown as new (options?: AjvOptions) => import("ajv").default;
const addFormats = addFormatsModule as unknown as (ajv: import("ajv").default) => void;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export interface SchemaValidationResult {
  valid: boolean;
  errors: ErrorObject[] | null | undefined;
}

export function validateAgainstSchema(data: unknown, schema: JsonSchema): SchemaValidationResult {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return { valid, errors: validate.errors };
}
