import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CustomStep } from "../types/customStep.js";

let cache: Map<string, CustomStep> | undefined;

/**
 * Builds a name -> function map from every direct file under customSteps/ (not
 * recursive — subfolders are ignored) via real dynamic import, never string
 * interpolation or eval. Every function-valued named export from every file is
 * registered under its own export name — a file may export more than one step,
 * and the export name doesn't need to match the filename. If two files export
 * the same name, whichever is imported last silently wins.
 */
export async function loadCustomSteps(dir = "customSteps"): Promise<Map<string, CustomStep>> {
  if (cache) return cache;
  const registry = new Map<string, CustomStep>();
  if (!fs.existsSync(dir)) {
    cache = registry;
    return registry;
  }
  const files = fs.readdirSync(dir).filter((f) => /\.(ts|js|mjs)$/.test(f) && !f.endsWith(".d.ts"));
  for (const file of files) {
    const full = path.resolve(dir, file);
    const mod = (await import(pathToFileURL(full).href)) as Record<string, unknown>;
    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value === "function") {
        registry.set(exportName, value as CustomStep);
      }
    }
  }
  cache = registry;
  return registry;
}

export function getCustomStep(registry: Map<string, CustomStep>, name: string): CustomStep {
  const fn = registry.get(name);
  if (!fn) {
    throw new Error(
      `Unknown custom step "${name}" — no export by that name found under customSteps/. ` +
        `Available: ${Array.from(registry.keys()).join(", ") || "(none)"}`
    );
  }
  return fn;
}
