import type { DbAdapter } from "../src/db/DbAdapter.js";

export interface AssignmentRow {
  id: string;
  shipmentId: string;
  vehicleId: string;
  driverId: string;
  scheduledStart: string;
  scheduledEnd: string;
}

export async function getAssignmentById(db: DbAdapter, id: string): Promise<AssignmentRow | undefined> {
  const rows = await db.query<AssignmentRow>(
    `SELECT id, "shipmentId", "vehicleId", "driverId", "scheduledStart", "scheduledEnd" FROM assignments WHERE id = ?`,
    [id]
  );
  return rows[0];
}

export async function getAssignmentByShipmentId(db: DbAdapter, shipmentId: string): Promise<AssignmentRow | undefined> {
  const rows = await db.query<AssignmentRow>(
    `SELECT id, "shipmentId", "vehicleId", "driverId", "scheduledStart", "scheduledEnd" FROM assignments WHERE "shipmentId" = ?`,
    [shipmentId]
  );
  return rows[0];
}

/** Every assignment currently on the books for one vehicle — useful for scheduling-conflict checks. */
export async function getAssignmentsForVehicle(db: DbAdapter, vehicleId: string): Promise<AssignmentRow[]> {
  return db.query<AssignmentRow>(
    `SELECT id, "shipmentId", "vehicleId", "driverId", "scheduledStart", "scheduledEnd" FROM assignments WHERE "vehicleId" = ? ORDER BY "scheduledStart"`,
    [vehicleId]
  );
}
