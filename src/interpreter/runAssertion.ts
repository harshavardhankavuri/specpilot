import { expect, test } from "@playwright/test";
import type { APIResponse } from "@playwright/test";
import type { OperationDescriptor } from "../spec/loadSpec.js";
import type { AssertionSpec } from "../types/scenario.js";
import { validateAgainstSchema } from "../runtime/schemaValidate.js";
import { jsonPath } from "../runtime/jsonPath.js";
import { interpolateDeep } from "../runtime/interpolate.js";
import { matchesRegex, isOneOf, lengthOf, containsValue, bodyStartsWithBytes } from "./assertionPredicates.js";
import type { DbAdapter } from "../db/DbAdapter.js";

/**
 * "Response matches its documented schema for the returned status code" — the
 * automatic, spec-derived baseline every step gets for free, without an author
 * having to hand-write a status/schema assertion for the happy path.
 */
export async function runAutomaticAssertions(op: OperationDescriptor, response: APIResponse): Promise<void> {
  const status = response.status();
  const responseSpec = op.responses[String(status)] ?? op.responses.default;

  // Each check gets a neutral step title describing what it verifies, not the
  // failure text — a reporter (e.g. Allure) shows that title whether the check
  // passes or fails, and a failure-phrased title reads as a bug even when green.
  // The detailed diagnostic only appears in the thrown error, i.e. on failure.
  await test.step(`status ${status} is a documented response for ${op.operationId}`, () => {
    if (!responseSpec) {
      throw new Error(
        `Operation "${op.operationId}" returned status ${status}, which is not documented in the spec ` +
          `(documented: ${Object.keys(op.responses).join(", ")}).`
      );
    }
  });

  const schema = responseSpec?.schema;
  if (schema) {
    await test.step(`response body matches the documented schema for ${op.operationId}`, async () => {
      const body = await response.json().catch(() => undefined);
      const result = validateAgainstSchema(body, schema);
      if (!result.valid) {
        throw new Error(
          `Response body for "${op.operationId}" (status ${status}) does not match its documented schema:\n` +
            JSON.stringify(result.errors, null, 2)
        );
      }
    });
  }
}

/**
 * The shared equals/contains/exists/matches/oneOf/length/numeric operator set —
 * applied to either a jsonpath-extracted body value or a header value, so both
 * get the same checks without duplicating the comparison logic per source.
 * `label` is what shows up in the step title (e.g. "$.shipment.status" or
 * `header "content-type"`).
 */
async function runValueChecks(
  label: string,
  value: unknown,
  assertion: AssertionSpec,
  vars: Record<string, unknown>
): Promise<void> {
  if (assertion.equals !== undefined) {
    const expected = interpolateDeep(assertion.equals, vars);
    await test.step(`${label} equals ${JSON.stringify(expected)}`, () => {
      expect(value).toEqual(expected);
    });
  }
  if (assertion.contains !== undefined) {
    const expected = interpolateDeep(assertion.contains, vars);
    await test.step(`${label} contains ${JSON.stringify(expected)}`, () => {
      expect(containsValue(value, expected)).toBe(true);
    });
  }
  if (assertion.exists !== undefined) {
    await test.step(`${label} ${assertion.exists ? "exists" : "does not exist"}`, () => {
      if (assertion.exists) expect(value).not.toBeUndefined();
      else expect(value).toBeUndefined();
    });
  }
  if (assertion.matches !== undefined) {
    await test.step(`${label} matches /${assertion.matches}/`, () => {
      expect(matchesRegex(value, assertion.matches!)).toBe(true);
    });
  }
  if (assertion.oneOf !== undefined) {
    const expected = interpolateDeep(assertion.oneOf, vars) as unknown[];
    await test.step(`${label} is one of ${JSON.stringify(expected)}`, () => {
      expect(isOneOf(value, expected)).toBe(true);
    });
  }
  if (assertion.minLength !== undefined) {
    await test.step(`${label} length >= ${assertion.minLength}`, () => {
      expect(lengthOf(value)).toBeGreaterThanOrEqual(assertion.minLength!);
    });
  }
  if (assertion.maxLength !== undefined) {
    await test.step(`${label} length <= ${assertion.maxLength}`, () => {
      expect(lengthOf(value)).toBeLessThanOrEqual(assertion.maxLength!);
    });
  }
  if (assertion.greaterThan !== undefined) {
    await test.step(`${label} > ${assertion.greaterThan}`, () => {
      expect(value).toBeGreaterThan(assertion.greaterThan!);
    });
  }
  if (assertion.lessThan !== undefined) {
    await test.step(`${label} < ${assertion.lessThan}`, () => {
      expect(value).toBeLessThan(assertion.lessThan!);
    });
  }
  if (assertion.greaterThanOrEqual !== undefined) {
    await test.step(`${label} >= ${assertion.greaterThanOrEqual}`, () => {
      expect(value).toBeGreaterThanOrEqual(assertion.greaterThanOrEqual!);
    });
  }
  if (assertion.lessThanOrEqual !== undefined) {
    await test.step(`${label} <= ${assertion.lessThanOrEqual}`, () => {
      expect(value).toBeLessThanOrEqual(assertion.lessThanOrEqual!);
    });
  }
}

export async function runAssertion(
  assertion: AssertionSpec,
  response: APIResponse,
  vars: Record<string, unknown>,
  db: (name: string) => Promise<DbAdapter>
): Promise<void> {
  if (assertion.status !== undefined) {
    await test.step(`status equals ${assertion.status}`, () => {
      expect(response.status()).toBe(assertion.status);
    });
  }

  if (assertion.header !== undefined) {
    // Playwright normalizes response header names to lowercase.
    const value = response.headers()[assertion.header.toLowerCase()];
    await runValueChecks(`header "${assertion.header}"`, value, assertion, vars);
  }

  if (assertion.jsonpath !== undefined) {
    const body = await response.json().catch(() => undefined);
    const value = jsonPath(body, assertion.jsonpath);
    await runValueChecks(assertion.jsonpath, value, assertion, vars);
  }

  if (assertion.bodyStartsWith !== undefined || assertion.bodyMinBytes !== undefined || assertion.bodyMaxBytes !== undefined) {
    const raw = await response.body();

    if (assertion.bodyStartsWith !== undefined) {
      await test.step(`body starts with ${JSON.stringify(assertion.bodyStartsWith)}`, () => {
        expect(bodyStartsWithBytes(raw, assertion.bodyStartsWith!)).toBe(true);
      });
    }
    if (assertion.bodyMinBytes !== undefined) {
      await test.step(`body size >= ${assertion.bodyMinBytes} bytes`, () => {
        expect(raw.length).toBeGreaterThanOrEqual(assertion.bodyMinBytes!);
      });
    }
    if (assertion.bodyMaxBytes !== undefined) {
      await test.step(`body size <= ${assertion.bodyMaxBytes} bytes`, () => {
        expect(raw.length).toBeLessThanOrEqual(assertion.bodyMaxBytes!);
      });
    }
  }

  if (assertion.db !== undefined) {
    const adapter = await db(assertion.db);
    const query = assertion.query ? (interpolateDeep(assertion.query, vars) as string) : undefined;
    if (!query) throw new Error(`db assertion on connection "${assertion.db}" requires a \`query\`.`);
    const params = interpolateDeep(assertion.params ?? [], vars);

    await test.step(`db "${assertion.db}" query returns at least one row`, async () => {
      const rows = await adapter.query<Record<string, unknown>>(query, params);
      expect(rows.length, `db assertion query returned no rows: ${query}`).toBeGreaterThan(0);

      if (assertion.expectRow) {
        const expected = interpolateDeep(assertion.expectRow, vars);
        for (const [key, value] of Object.entries(expected)) {
          await test.step(`db "${assertion.db}" row.${key} equals ${JSON.stringify(value)}`, () => {
            expect(rows[0][key]).toEqual(value);
          });
        }
      }
    });
  }
}
