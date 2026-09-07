import { describe, it, expect } from "vitest";
import { jsonPath } from "../../src/runtime/jsonPath.js";

describe("jsonPath", () => {
  it("resolves a simple path", () => {
    expect(jsonPath({ shipment: { id: "abc" } }, "$.shipment.id")).toBe("abc");
  });

  it("returns undefined for a missing path", () => {
    expect(jsonPath({ a: 1 }, "$.b")).toBeUndefined();
  });
});
