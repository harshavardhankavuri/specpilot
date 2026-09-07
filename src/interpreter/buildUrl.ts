import type { OperationDescriptor } from "../spec/loadSpec.js";
import { interpolateDeep } from "../runtime/interpolate.js";

export function buildUrl(
  op: OperationDescriptor,
  params: Record<string, unknown> | undefined,
  query: Record<string, unknown> | undefined,
  vars: Record<string, unknown>
): string {
  const resolvedParams = interpolateDeep(params ?? {}, vars) as Record<string, unknown>;
  const resolvedQuery = interpolateDeep(query ?? {}, vars) as Record<string, unknown>;

  let url = op.pathTemplate;
  for (const paramName of op.pathParams) {
    if (!(paramName in resolvedParams)) {
      throw new Error(
        `Operation "${op.operationId}" requires path param "${paramName}" but step did not provide it under \`params\`.`
      );
    }
    url = url.replace(`{${paramName}}`, encodeURIComponent(String(resolvedParams[paramName])));
  }

  for (const requiredQ of op.requiredQueryParams) {
    if (!(requiredQ in resolvedQuery)) {
      throw new Error(
        `Operation "${op.operationId}" requires query param "${requiredQ}" but step did not provide it under \`query\`.`
      );
    }
  }

  const queryEntries = Object.entries(resolvedQuery).filter(([, v]) => v !== undefined);
  if (queryEntries.length > 0) {
    const search = new URLSearchParams();
    for (const [k, v] of queryEntries) search.set(k, String(v));
    url += `?${search.toString()}`;
  }
  return url;
}
