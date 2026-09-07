import fs from "node:fs";
import path from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { scenarioFileSchema } from "../schema/scenarioSchema.js";

/**
 * Regenerates the JSON Schema used for editor IntelliSense on *.scenario.yaml /
 * *.cases.yaml — derived directly from the same Zod schema that validates
 * scenarios at load time (discoverScenarios.ts), so the two can never drift.
 * Disposable, like the spec cache: never hand-edit, just regenerate.
 */
export function generateScenarioJsonSchema(outFile = "schemas/scenario.schema.json"): void {
  const jsonSchema = zodToJsonSchema(scenarioFileSchema, "ScenarioFile");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(jsonSchema, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${outFile}`);
}
