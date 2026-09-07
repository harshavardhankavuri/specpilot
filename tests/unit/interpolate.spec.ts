import { describe, it, expect } from "vitest";
import { interpolateDeep, interpolateString } from "../../src/runtime/interpolate.js";

describe("interpolate", () => {
  it("substitutes a whole-string placeholder preserving type", () => {
    expect(interpolateString("{{id}}", { id: 42 })).toBe(42);
  });

  it("substitutes an embedded placeholder as a string", () => {
    expect(interpolateString("id={{id}}", { id: 42 })).toBe("id=42");
  });

  it("falls back to process.env", () => {
    process.env.MY_TEST_VAR = "from-env";
    expect(interpolateString("{{MY_TEST_VAR}}", {})).toBe("from-env");
    delete process.env.MY_TEST_VAR;
  });

  it("throws on an unresolved placeholder", () => {
    expect(() => interpolateString("{{missing}}", {})).toThrow(/Unresolved placeholder/);
  });

  it("recurses into nested objects/arrays", () => {
    const result = interpolateDeep({ a: ["{{x}}", { b: "{{y}}" }] }, { x: 1, y: "z" });
    expect(result).toEqual({ a: [1, { b: "z" }] });
  });
});
