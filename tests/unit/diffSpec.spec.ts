import { describe, it, expect } from "vitest";
import { diffSpec } from "../../src/spec/diffSpec.js";
import type { OperationDescriptor } from "../../src/spec/loadSpec.js";

function op(overrides: Partial<OperationDescriptor> & { operationId: string }): OperationDescriptor {
  return {
    method: "get",
    pathTemplate: "/things",
    pathParams: [],
    requiredQueryParams: [],
    optionalQueryParams: [],
    responses: { "200": {} },
    ...overrides,
  };
}

describe("diffSpec", () => {
  it("reports added and removed operations", () => {
    const before = new Map([["keep", op({ operationId: "keep" })], ["gone", op({ operationId: "gone" })]]);
    const after = new Map([["keep", op({ operationId: "keep" })], ["new", op({ operationId: "new" })]]);

    const drift = diffSpec(before, after);
    expect(drift.added).toEqual(["new"]);
    expect(drift.removed).toEqual(["gone"]);
    expect(drift.changed).toEqual([]);
  });

  it("flags a method change and a path change as breaking", () => {
    const before = new Map([["op1", op({ operationId: "op1", method: "get", pathTemplate: "/a" })]]);
    const after = new Map([["op1", op({ operationId: "op1", method: "post", pathTemplate: "/b" })]]);

    const drift = diffSpec(before, after);
    expect(drift.changed).toHaveLength(2);
    expect(drift.changed.every((c) => c.breaking)).toBe(true);
    expect(drift.changed.map((c) => c.detail).join(" ")).toContain("GET -> POST");
    expect(drift.changed.map((c) => c.detail).join(" ")).toContain("/a -> /b");
  });

  it("flags a new required path/query param as breaking, a removed one as informational", () => {
    const before = new Map([
      ["op1", op({ operationId: "op1", pathParams: ["id"], requiredQueryParams: ["filter"] })],
    ]);
    const after = new Map([
      ["op1", op({ operationId: "op1", pathParams: ["id", "subId"], requiredQueryParams: [] })],
    ]);

    const drift = diffSpec(before, after);
    const pathParamChange = drift.changed.find((c) => c.detail.includes("subId"));
    const queryParamChange = drift.changed.find((c) => c.detail.includes("filter"));
    expect(pathParamChange?.breaking).toBe(true);
    expect(queryParamChange?.breaking).toBe(false);
  });

  it("flags a newly-required request body field as breaking and a dropped one as informational", () => {
    const schemaWith = (required: string[], properties: Record<string, { type: string }>) => ({
      $ref: "#/components/schemas/Body",
      components: { schemas: { Body: { type: "object", required, properties } } },
    });

    const before = new Map([
      [
        "op1",
        op({
          operationId: "op1",
          requestBodySchema: schemaWith(["name"], { name: { type: "string" }, age: { type: "number" } }),
        }),
      ],
    ]);
    const after = new Map([
      [
        "op1",
        op({
          operationId: "op1",
          requestBodySchema: schemaWith(["name", "email"], { name: { type: "string" }, age: { type: "string" } }),
        }),
      ],
    ]);

    const drift = diffSpec(before, after);
    const newRequired = drift.changed.find((c) => c.detail.includes("email"));
    const typeChange = drift.changed.find((c) => c.detail.includes("age"));
    expect(newRequired?.breaking).toBe(true);
    expect(typeChange?.breaking).toBe(true);
    expect(typeChange?.detail).toContain("number -> string");
  });

  it("flags a removed documented status as breaking and a newly documented one as informational", () => {
    const before = new Map([["op1", op({ operationId: "op1", responses: { "200": {}, "404": {} } })]]);
    const after = new Map([["op1", op({ operationId: "op1", responses: { "200": {}, "429": {} } })]]);

    const drift = diffSpec(before, after);
    const removedStatus = drift.changed.find((c) => c.detail.includes("404"));
    const addedStatus = drift.changed.find((c) => c.detail.includes("429"));
    expect(removedStatus?.breaking).toBe(true);
    expect(addedStatus?.breaking).toBe(false);
  });

  it("reports no changes for an identical spec", () => {
    const spec = new Map([["op1", op({ operationId: "op1" })]]);
    const drift = diffSpec(spec, spec);
    expect(drift.added).toEqual([]);
    expect(drift.removed).toEqual([]);
    expect(drift.changed).toEqual([]);
  });
});
