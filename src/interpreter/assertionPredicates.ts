// Pure comparison logic for the jsonpath edge-case assertion operators — kept
// separate from runAssertion.ts's Playwright `test.step()` wrapping so this logic
// is unit-testable without a running Playwright test (test.step() throws outside one).

export function matchesRegex(value: unknown, pattern: string): boolean {
  return new RegExp(pattern).test(String(value));
}

export function isOneOf(value: unknown, allowed: unknown[]): boolean {
  return allowed.some((candidate) => deepEqual(candidate, value));
}

/**
 * Array membership when `value` is an array; substring containment otherwise
 * (coercing both sides to strings) — "contains" means different things for a
 * list field vs. a string field, and both are common enough to share one operator.
 */
export function containsValue(value: unknown, expected: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => deepEqual(item, expected));
  return String(value).includes(String(expected));
}

/** Returns undefined when `value` has no meaningful length (not a string/array). */
export function lengthOf(value: unknown): number | undefined {
  if (typeof value === "string" || Array.isArray(value)) return value.length;
  return undefined;
}

/** Byte-for-byte prefix check (e.g. a file's magic bytes), decoded as latin1 so every byte value round-trips 1:1. */
export function bodyStartsWithBytes(body: Buffer, prefix: string): boolean {
  return body.toString("latin1").startsWith(prefix);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
