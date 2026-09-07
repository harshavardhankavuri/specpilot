import type { CustomStep } from "@assertquest/specpilot/types/customStep";

/**
 * Fires two identical POST /api/booking requests concurrently and checks the API
 * creates two distinct shipments rather than silently deduping or corrupting one of
 * them — documents that booking creation has no idempotency key / unique constraint.
 * Needs Promise.all across two calls plus a cross-response comparison, so it can't be
 * expressed as declarative operation/assert steps.
 */
export const createDuplicateBookingsConcurrently: CustomStep = async (ctx) => {
  const roleRequest = await ctx.roleRequest(ctx.defaultAuth ?? "admin");
  const body = {
    origin: { label: "Warehouse A", lat: 40.7128, lng: -74.006 },
    destination: { label: "Customer Site", lat: 34.0522, lng: -118.2437 },
    package: { weightKg: 12.5, lengthCm: 40, widthCm: 30, heightCm: 20 },
  };

  const [resA, resB] = await Promise.all([
    roleRequest.fetch("/api/booking", { method: "POST", data: body }),
    roleRequest.fetch("/api/booking", { method: "POST", data: body }),
  ]);
  const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);

  ctx.vars.dupStatusA = resA.status();
  ctx.vars.dupStatusB = resB.status();
  ctx.vars.dupIdA = bodyA?.shipment?.id;
  ctx.vars.dupIdB = bodyB?.shipment?.id;

  if (resA.status() !== 201 || resB.status() !== 201) {
    throw new Error(
      `Expected two identical concurrent booking creates to both succeed with 201, got ${resA.status()} and ${resB.status()}.`,
    );
  }
  if (!ctx.vars.dupIdA || !ctx.vars.dupIdB || ctx.vars.dupIdA === ctx.vars.dupIdB) {
    throw new Error(
      `Expected two distinct shipment ids for duplicate concurrent booking creates, got ` +
        `"${ctx.vars.dupIdA}" and "${ctx.vars.dupIdB}".`,
    );
  }
};

/**
 * Checks that GET /api/booking, called as the customer role, only ever returns
 * shipments owned by that same customer. `assert.jsonpath` isn't part of the
 * interpolation set (only params/query/headers/body/equals/contains/oneOf/db are —
 * see docs/scenario-format.md), so a filter like
 * `$.shipments[?(@.customerId!="{{myId}}")]` can't reference an extracted var and
 * silently compares against the literal, unresolved string instead. This does the
 * same "no foreign rows" check in TypeScript, where the var is a real value.
 */
export const assertBookingListIsOwnBookingsOnly: CustomStep = async (ctx) => {
  const roleRequest = await ctx.roleRequest("customer");
  const meRes = await roleRequest.fetch("/api/auth/me", { method: "GET" });
  const me = await meRes.json();
  const myId = me?.user?.id;

  const listRes = await roleRequest.fetch("/api/booking", { method: "GET" });
  const { shipments } = await listRes.json();

  const foreign = (shipments ?? []).filter((s: { customerId: string }) => s.customerId !== myId);
  if (foreign.length > 0) {
    throw new Error(
      `Customer ${myId}'s booking list included ${foreign.length} shipment(s) owned by someone else: ` +
        JSON.stringify(foreign.map((s: { id: string; customerId: string }) => ({ id: s.id, customerId: s.customerId }))),
    );
  }
};
