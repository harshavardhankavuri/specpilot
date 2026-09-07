const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

function resolveToken(token: string, vars: Record<string, unknown>): unknown {
  if (token in vars) return vars[token];
  if (token in process.env) return process.env[token];
  return undefined;
}

/**
 * Replaces {{VAR}} / {{varName}} placeholders. If the whole string is a single
 * placeholder, the resolved value's original type is preserved (so a var holding
 * a number/object stays that type rather than being stringified).
 */
export function interpolateString(value: string, vars: Record<string, unknown>): unknown {
  const wholeMatch = value.match(/^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/);
  if (wholeMatch) {
    const resolved = resolveToken(wholeMatch[1], vars);
    if (resolved === undefined) {
      throw new Error(`Unresolved placeholder "{{${wholeMatch[1]}}}" — not found in scenario vars or env.`);
    }
    return resolved;
  }
  return value.replace(PLACEHOLDER, (_full, token: string) => {
    const resolved = resolveToken(token, vars);
    if (resolved === undefined) {
      throw new Error(`Unresolved placeholder "{{${token}}}" — not found in scenario vars or env.`);
    }
    return String(resolved);
  });
}

export function interpolateDeep<T>(value: T, vars: Record<string, unknown>): T {
  if (typeof value === "string") {
    return interpolateString(value, vars) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => interpolateDeep(v, vars)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolateDeep(v, vars);
    }
    return out as unknown as T;
  }
  return value;
}
