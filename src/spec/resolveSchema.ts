import type { JsonSchema } from "./loadSpec.js";

/**
 * `requestBodySchema` (and each response's `.schema`) is either a self-contained object schema,
 * or a `{ $ref, components }` pointer left un-dereferenced by `bundle()` (see loadSpec.ts) — this
 * resolves one level of `$ref` against the schema's own `components.schemas`. Nested $ref'd
 * sub-objects (e.g. a property that is itself a $ref) are intentionally not recursed into.
 */
export function resolveSchema(schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!schema) return undefined;
  const ref = schema.$ref as string | undefined;
  if (!ref) return schema;
  const refName = ref.split("/").pop();
  const components = schema.components as { schemas?: Record<string, JsonSchema> } | undefined;
  return refName ? components?.schemas?.[refName] : undefined;
}
