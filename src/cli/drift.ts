/**
 * `apitest drift` — compares the live OpenAPI spec against the cached one in `.spec-cache/`
 * without requiring a full `sync` first. Surfaces removed/breaking/informational operation
 * changes and which scenario files reference each one, so authors can assess impact before
 * accepting the new spec. Pass `--sync` to accept it in the same run.
 */

import { loadConfig } from "./loadConfig.js";
import { loadSpec, readSpecCache } from "../spec/loadSpec.js";
import { diffSpec, type OperationChange } from "../spec/diffSpec.js";
import { discoverScenarios } from "../interpreter/discoverScenarios.js";
import type { ScenarioFile, ScenarioStep } from "../types/scenario.js";
import { writeSpecCache } from "../spec/loadSpec.js";

export interface DriftOptions {
  /** If true, accept the live spec into .spec-cache/ after reporting drift (equivalent to running sync afterward). */
  sync?: boolean;
}

/** operationId -> every "<file> (<scenario/case name>)" location that references it. */
function buildUsageIndex(scenarios: ScenarioFile[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const record = (step: ScenarioStep, label: string) => {
    if (!step.operation) return;
    const locations = index.get(step.operation) ?? [];
    locations.push(label);
    index.set(step.operation, locations);
  };

  for (const scenario of scenarios) {
    for (const step of scenario.steps ?? []) record(step, `${scenario.sourceFile} (${scenario.name})`);
    for (const c of scenario.cases ?? []) {
      for (const step of c.steps) record(step, `${scenario.sourceFile} (${scenario.name} > ${c.name})`);
    }
  }
  return index;
}

/** Logs one changed-operation line, prefixed ⚠ for breaking or ℹ for informational, plus its scenario usages if any. */
function printChange(change: OperationChange, usages: string[]): void {
  const icon = change.breaking ? "⚠" : "ℹ";
  console.log(`  ${icon} ${change.operationId}: ${change.detail}`);
  if (usages.length > 0) {
    console.log(`      used by: ${usages.join(", ")}`);
  }
}

/**
 * Diffs the live OpenAPI spec against the last synced `.spec-cache/`, without touching the
 * cache unless `options.sync` is set. Reports removed operations, breaking/non-breaking changes
 * to existing operations, and newly added operations — cross-referenced against every scenario
 * step that uses each affected operationId.
 *
 * Returns a process exit code: 1 if any removed operation or breaking change is found, else 0.
 */
export async function runDrift(options: DriftOptions): Promise<number> {
  const config = await loadConfig();

  let before;
  try {
    before = readSpecCache(config.specCacheDir).operations;
  } catch {
    console.log(`No cached spec found — nothing to diff against. Run "apitest sync" first, then re-run "apitest drift" after the spec changes again.`);
    return 0;
  }

  console.log(`Fetching the live spec from ${config.spec} to compare against the cached one ...`);
  const liveSpec = await loadSpec(config.spec);
  const after = liveSpec.operations;

  const drift = diffSpec(before, after);
  const scenarios = discoverScenarios(config.scenariosDir);
  const usageIndex = buildUsageIndex(scenarios);

  if (drift.added.length === 0 && drift.removed.length === 0 && drift.changed.length === 0) {
    console.log(`No drift — the live spec matches the cached one (${before.size} operations).`);
    return 0;
  }

  const breakingChanges = drift.changed.filter((c) => c.breaking);
  const infoChanges = drift.changed.filter((c) => !c.breaking);

  if (drift.removed.length > 0) {
    console.log(`\nRemoved operations (${drift.removed.length}) — any scenario step referencing these will fail check/run:`);
    for (const id of drift.removed) {
      console.log(`  ⚠ ${id}`);
      const usages = usageIndex.get(id) ?? [];
      if (usages.length > 0) console.log(`      used by: ${usages.join(", ")}`);
      else console.log(`      (not currently referenced by any scenario)`);
    }
  }

  if (breakingChanges.length > 0) {
    console.log(`\nBreaking changes to existing operations (${breakingChanges.length}) — review before trusting a green run:`);
    for (const change of breakingChanges) printChange(change, usageIndex.get(change.operationId) ?? []);
  }

  if (drift.added.length > 0) {
    console.log(`\nNew operations (${drift.added.length}) — nothing to fix, just an FYI:`);
    for (const id of drift.added) console.log(`  ℹ ${id}`);
  }

  if (infoChanges.length > 0) {
    console.log(`\nNon-breaking changes (${infoChanges.length}):`);
    for (const change of infoChanges) printChange(change, usageIndex.get(change.operationId) ?? []);
  }

  const breakingCount = drift.removed.length + breakingChanges.length;
  console.log(
    `\n${breakingCount} breaking change(s), ${drift.added.length + infoChanges.length} informational change(s).`
  );

  if (options.sync) {
    await writeSpecCache(liveSpec, config.specCacheDir);
    console.log(`Synced — .spec-cache/ now matches the live spec. Re-run "apitest check" to see which scenarios need updating.`);
  } else if (breakingCount > 0) {
    console.log(`Cache left untouched. Run "apitest drift --sync" once you've addressed the breaking changes above.`);
  }

  return breakingCount > 0 ? 1 : 0;
}
