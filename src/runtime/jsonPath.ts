import { JSONPath } from "jsonpath-plus";

export function jsonPath(data: unknown, expression: string): unknown {
  const result = JSONPath({ path: expression, json: data as object, wrap: false });
  return result;
}
