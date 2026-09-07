import type { DbAdapter } from "../src/db/DbAdapter.js";

/**
 * Row shapes here are a hand-picked subset of the `shipments` table's columns — just what
 * these queries actually select, not the whole table. For the full column list, regenerate
 * `src/db/types/*.d.ts` via `npx apitest db:introspect --connection primary --env local` (that
 * output is gitignored/generated, so queries.ts intentionally doesn't import from it — this file
 * has to work in a fresh checkout before anyone's run introspect).
 */
export interface ShipmentRow {
  id: string;
  status: string;
  customerId: string;
  priceCents: number;
  distanceKm: number;
  approved: boolean;
  createdAt: string;
}

export async function getShipmentById(db: DbAdapter, id: string): Promise<ShipmentRow | undefined> {
  const rows = await db.query<ShipmentRow>(
    `SELECT id, status, "customerId", "priceCents", "distanceKm", approved, "createdAt" FROM shipments WHERE id = ?`,
    [id]
  );
  return rows[0];
}

export async function countShipmentsForCustomer(db: DbAdapter, customerId: string): Promise<number> {
  const rows = await db.query<{ count: string }>(`SELECT COUNT(*) as count FROM shipments WHERE "customerId" = ?`, [
    customerId,
  ]);
  return Number(rows[0]?.count ?? 0);
}

export async function getShipmentsByStatus(db: DbAdapter, status: string): Promise<ShipmentRow[]> {
  return db.query<ShipmentRow>(
    `SELECT id, status, "customerId", "priceCents", "distanceKm", approved, "createdAt" FROM shipments WHERE status = ?`,
    [status]
  );
}
