import type { CustomStep } from "@assertquest/specpilot/types/customStep";

/**
 * Setup: grabs a real vehicleId/driverId to assign, so the race step below doesn't
 * need hardcoded fleet data.
 */
export const pickVehicleAndDriver: CustomStep = async (ctx) => {
  const roleRequest = await ctx.roleRequest(ctx.defaultAuth ?? "admin");

  const vehiclesRes = await roleRequest.fetch("/api/fleet/vehicles", { method: "GET" });
  const { vehicles } = await vehiclesRes.json();
  const driversRes = await roleRequest.fetch("/api/fleet/drivers", { method: "GET" });
  const { drivers } = await driversRes.json();

  if (!vehicles?.length || !drivers?.length) {
    throw new Error("Need at least one seeded vehicle and driver to run the assignment race.");
  }

  ctx.vars.raceVehicleId = vehicles[0].id;
  ctx.vars.raceDriverId = drivers[0].id;
};

/**
 * Fires two concurrent PUT /api/fleet/assignments/{shipmentId} requests for the same
 * shipment — same vehicle/driver, different schedule windows — then reads the
 * assignment back and checks the stored schedule matches exactly one of the two
 * writes in full, never a mix of both (which would indicate a lost-update / torn-write
 * race condition). This can't be expressed declaratively: it needs two requests fired
 * in parallel (`Promise.all`, not two sequential `operation:` steps) and a correctness
 * check that spans both requests' payloads plus a follow-up read.
 */
export const raceAssignmentUpdate: CustomStep = async (ctx) => {
  const shipmentId = ctx.vars.shipmentId;
  const vehicleId = ctx.vars.raceVehicleId;
  const driverId = ctx.vars.raceDriverId;
  if (!shipmentId || !vehicleId || !driverId) {
    throw new Error("raceAssignmentUpdate requires shipmentId, raceVehicleId, raceDriverId in vars.");
  }

  const roleRequest = await ctx.roleRequest(ctx.defaultAuth ?? "admin");

  const payloadA = {
    vehicleId,
    driverId,
    scheduledStart: "2027-01-01T09:00:00.000Z",
    scheduledEnd: "2027-01-01T10:00:00.000Z",
  };
  const payloadB = {
    vehicleId,
    driverId,
    scheduledStart: "2027-01-01T14:00:00.000Z",
    scheduledEnd: "2027-01-01T15:00:00.000Z",
  };

  const [resA, resB] = await Promise.all([
    roleRequest.fetch(`/api/fleet/assignments/${shipmentId}`, { method: "PUT", data: payloadA }),
    roleRequest.fetch(`/api/fleet/assignments/${shipmentId}`, { method: "PUT", data: payloadB }),
  ]);
  ctx.vars.raceStatusA = resA.status();
  ctx.vars.raceStatusB = resB.status();

  const listRes = await roleRequest.fetch("/api/fleet/assignments", { method: "GET" });
  const { assignments } = await listRes.json();
  const final = (assignments ?? []).find((a: { shipmentId: string }) => a.shipmentId === shipmentId);

  if (!final) {
    throw new Error(`No assignment found for shipment ${shipmentId} after concurrent PUTs.`);
  }

  const matchesA = final.scheduledStart === payloadA.scheduledStart && final.scheduledEnd === payloadA.scheduledEnd;
  const matchesB = final.scheduledStart === payloadB.scheduledStart && final.scheduledEnd === payloadB.scheduledEnd;

  ctx.vars.raceFinalAssignment = final;

  if (!matchesA && !matchesB) {
    throw new Error(
      `Concurrent PUTs produced a torn/mixed write for shipment ${shipmentId}: ` +
        `final=${JSON.stringify({ scheduledStart: final.scheduledStart, scheduledEnd: final.scheduledEnd })}, ` +
        `expected either ${JSON.stringify(payloadA)} or ${JSON.stringify(payloadB)}.`,
    );
  }
};
