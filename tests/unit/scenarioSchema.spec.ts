import { describe, it, expect } from "vitest";
import { scenarioFileSchema } from "../../src/schema/scenarioSchema.js";

describe("scenarioFileSchema", () => {
  it("accepts a valid chained-steps scenario", () => {
    const result = scenarioFileSchema.safeParse({
      name: "booking-flow",
      tags: ["booking"],
      steps: [{ operation: "createBooking", body: {}, extract: { id: "$.id" } }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid cases file", () => {
    const result = scenarioFileSchema.safeParse({
      name: "booking-flow",
      cases: [{ name: "401", steps: [{ operation: "createBooking", assert: [{ status: 401 }] }] }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a step with neither operation nor custom", () => {
    const result = scenarioFileSchema.safeParse({ name: "x", steps: [{ body: {} }] });
    expect(result.success).toBe(false);
  });

  it("rejects a step with both operation and custom", () => {
    const result = scenarioFileSchema.safeParse({
      name: "x",
      steps: [{ operation: "a", custom: "b" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a file with neither steps nor cases", () => {
    const result = scenarioFileSchema.safeParse({ name: "x" });
    expect(result.success).toBe(false);
  });
});
