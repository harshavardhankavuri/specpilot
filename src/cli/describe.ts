import { loadConfig } from "./loadConfig.js";
import { readSpecCache } from "../spec/loadSpec.js";
import type { JsonSchema, OperationDescriptor } from "../spec/loadSpec.js";
import { resolveSchema } from "../spec/resolveSchema.js";

export interface DescribeOptions {
  operationIds: string[];
}

function constraintsOf(prop: JsonSchema): string[] {
  const parts: string[] = [];
  if (prop.minimum !== undefined) parts.push(`min ${prop.minimum}`);
  if (prop.maximum !== undefined) parts.push(`max ${prop.maximum}`);
  if (prop.exclusiveMinimum !== undefined) parts.push(`> ${prop.exclusiveMinimum}`);
  if (prop.exclusiveMaximum !== undefined) parts.push(`< ${prop.exclusiveMaximum}`);
  if (prop.minLength !== undefined) parts.push(`minLength ${prop.minLength}`);
  if (prop.maxLength !== undefined) parts.push(`maxLength ${prop.maxLength}`);
  if (prop.format !== undefined) parts.push(`format ${prop.format}`);
  if (Array.isArray(prop.enum)) parts.push(`enum [${(prop.enum as unknown[]).join(", ")}]`);
  return parts;
}

/**
 * Prints each body property one level deep, resolving a nested `$ref` property (e.g.
 * `origin: { $ref: AddressPoint }`) against the same `components` bag the top-level schema
 * carries — this repo's operations only ever need one level of nesting described usefully
 * (see resolveSchema.ts's doc comment for why deeper recursion isn't worth it here).
 */
function printBodySchema(schema: JsonSchema, components: unknown, indent: string): void {
  const required = new Set((schema.required as string[] | undefined) ?? []);
  const properties = (schema.properties as Record<string, JsonSchema> | undefined) ?? {};

  for (const [name, prop] of Object.entries(properties)) {
    const req = required.has(name) ? "required" : "optional";
    const ref = prop.$ref as string | undefined;
    if (ref) {
      const refName = ref.split("/").pop();
      const nested = (components as { schemas?: Record<string, JsonSchema> } | undefined)?.schemas?.[refName!];
      console.log(`${indent}${name}: object (${req})`);
      if (nested) printBodySchema(nested, components, indent + "  ");
      continue;
    }
    const constraints = constraintsOf(prop);
    const suffix = constraints.length > 0 ? ` [${constraints.join(", ")}]` : "";
    console.log(`${indent}${name}: ${prop.type ?? "any"} (${req})${suffix}`);
  }
}

function describeOperation(op: OperationDescriptor): void {
  console.log(`\n${op.operationId}`);
  console.log(`  ${op.method.toUpperCase()} ${op.pathTemplate}`);
  if (op.pathParams.length > 0) console.log(`  path params: ${op.pathParams.join(", ")}`);
  if (op.requiredQueryParams.length > 0) console.log(`  required query params: ${op.requiredQueryParams.join(", ")}`);
  if (op.optionalQueryParams.length > 0) console.log(`  optional query params: ${op.optionalQueryParams.join(", ")}`);
  console.log(`  auth: ${op.security && op.security.length > 0 ? op.security.join(", ") : "none documented"}`);

  const body = resolveSchema(op.requestBodySchema);
  if (body) {
    console.log(`  request body:`);
    printBodySchema(body, (op.requestBodySchema as { components?: unknown })?.components, "    ");
  }

  console.log(`  documented responses: ${Object.keys(op.responses).join(", ") || "(none)"}`);
}

export async function runDescribe(options: DescribeOptions): Promise<number> {
  const config = await loadConfig();
  let spec;
  try {
    spec = readSpecCache(config.specCacheDir);
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }

  let exitCode = 0;
  for (const id of options.operationIds) {
    const op = spec.operations.get(id);
    if (!op) {
      console.error(`\nUnknown operationId "${id}" — not found in the synced spec. Run "npx apitest sync" if the API changed.`);
      exitCode = 1;
      continue;
    }
    describeOperation(op);
  }
  return exitCode;
}
