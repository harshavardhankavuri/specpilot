// Single import point for every named query — `import { getShipmentById } from "../queries/index.js"`
// instead of a per-table path. Add a new query function to shipments.ts/assignments.ts (or a new
// file per table as the schema grows) and re-export it here.
export * from "./shipments.js";
export * from "./assignments.js";
