import type { CustomStep } from "@assertquest/specpilot/types/customStep";

/**
 * Setup: computes test-run-unique data before the flow starts. Anything written
 * to ctx.vars here is available to every later step via {{varName}}, same as `extract`.
 */
export const generateBookingLabels: CustomStep = async (ctx) => {
  const runId = Date.now().toString(36);
  ctx.vars.pickupLabel = `Warehouse A (test-${runId})`;
  ctx.vars.dropoffLabel = `Customer Site (test-${runId})`;
};

/**
 * Transform: rewrites an already-extracted value in place. `shipmentId` was put
 * into ctx.vars by the previous step's `extract:` — this just reshapes it.
 */
export const normalizeShipmentId: CustomStep = async (ctx) => {
  ctx.vars.shipmentId = String(ctx.vars.shipmentId).trim().toLowerCase();
};

/**
 * Cleanup: runs whether the scenario passed or failed (see runScenarioBody.ts).
 * SwiftCargo has no delete/cancel endpoint for a booking, so this only advances
 * its lifecycle one step — it does not actually remove the test data. It's here
 * to demonstrate the guaranteed-cleanup mechanism, not as a real teardown.
 */
export const advanceTestShipment: CustomStep = async (ctx) => {
  if (!ctx.vars.shipmentId) return; // nothing was created yet (e.g. setup itself failed)
  const roleRequest = await ctx.roleRequest(ctx.defaultAuth ?? "admin");
  await roleRequest.fetch(`/api/tracking/${ctx.vars.shipmentId}/advance`, {
    method: "POST",
    data: {},
  });
};
