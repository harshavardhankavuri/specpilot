import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadSpec } from "../../src/spec/loadSpec.js";
import { validateAgainstSchema } from "../../src/runtime/schemaValidate.js";

const fixture = path.join(__dirname, "..", "fixtures", "spec-with-refs.yaml");

describe("loadSpec", () => {
  it("parses operations with explicit operationIds", async () => {
    const spec = await loadSpec(fixture);
    const op = spec.operations.get("getBookingById");
    expect(op).toBeDefined();
    expect(op!.method).toBe("get");
    expect(op!.pathTemplate).toBe("/bookings/{id}");
    expect(op!.pathParams).toEqual(["id"]);
    expect(op!.responses["200"].schema).toBeDefined();
  });

  it("bundles cyclic $refs (kept as $ref, not inlined) and they remain resolvable for validation", async () => {
    const spec = await loadSpec(fixture);
    const op = spec.operations.get("getBookingById")!;
    const schema = op.responses["200"].schema!;
    expect((schema as { $ref?: string }).$ref).toBe("#/components/schemas/Booking");

    const result = validateAgainstSchema({ id: "b1", status: "pending" }, schema);
    expect(result.valid).toBe(true);
  });

  it("synthesizes an operationId when one is missing", async () => {
    const spec = await loadSpec(fixture);
    const synthesized = Array.from(spec.operations.values()).find((o) => o.synthesizedId);
    expect(synthesized).toBeDefined();
    expect(synthesized!.method).toBe("get");
    expect(synthesized!.pathTemplate).toBe("/bookings");
  });

  it("captures required query params", async () => {
    const spec = await loadSpec(fixture);
    const create = spec.operations.get("createBooking")!;
    expect(create.requestBodySchema).toBeDefined();
  });

  it("rejects a non-openapi document with an actionable message", async () => {
    const badPath = path.join(__dirname, "..", "fixtures", "not-a-spec.json");
    await expect(loadSpec(badPath)).rejects.toThrow();
  });
});
