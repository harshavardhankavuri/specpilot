import type { CustomStep } from "@assertquest/specpilot/types/customStep";
import { getShipmentById } from "../queries/index.js";

/**
 * Queries the shipment's row directly via ctx.db() (the "custom step reads the DB" shape —
 * for when the declarative `assert: - db:` field's flat expectRow equality isn't enough, e.g.
 * because you need the value for something *later* in the scenario, not just to check it here).
 * Writes the DB's own priceCents into ctx.vars so a later `operation:` step's assertion can
 * compare the API response against what the database actually has, not a hardcoded number.
 */
export const fetchShipmentFromDb: CustomStep = async (ctx) => {
  const db = await ctx.db("primary");
  const shipmentId = ctx.vars.shipmentId as string;
  const row = await getShipmentById(db, shipmentId);
  if (!row) {
    throw new Error(`No shipment row found in the database for id "${shipmentId}".`);
  }
  ctx.vars.dbPriceCents = row.priceCents;
  ctx.vars.dbDistanceKm = row.distanceKm;
  ctx.vars.dbStatus = row.status;
};
