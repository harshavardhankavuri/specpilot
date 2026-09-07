import type { CustomStep } from "@assertquest/specpilot/types/customStep";

/**
 * Reference implementation for the escape hatch: a typed function, looked up by
 * export name from a scenario step's `custom:` field. Stamps the moment a driver
 * handoff was confirmed, for scenarios that need that timestamp later (e.g. to
 * assert a shipment's tracking history reflects it) but have no API response to
 * pull it from.
 */
export const recordHandoffTimestamp: CustomStep = async (ctx) => {
  ctx.vars.handoffRecordedAt = new Date().toISOString();
};
