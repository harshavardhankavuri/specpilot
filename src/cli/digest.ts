import fs from "node:fs";
import path from "node:path";

/**
 * Local-only summarizer over allure-playwright's raw JSON output. Reads nothing but
 * `<resultsDir>/*.json` — no network calls, no `environments/*.env`, no API credentials.
 */

interface AllureLabel {
  name: string;
  value: string;
}

interface AllureResult {
  name: string;
  fullName?: string;
  status: "passed" | "failed" | "broken" | "skipped" | "unknown";
  statusDetails?: { message?: string; trace?: string };
  labels?: AllureLabel[];
  historyId?: string;
  start?: number;
  stop?: number;
}

export interface DigestOptions {
  dir?: string;
  historyFile?: string;
}

interface HistoryEntry {
  name: string;
  message: string;
}
interface HistoryFile {
  recordedAt: string;
  failing: Record<string, HistoryEntry>; // historyId -> entry
}

const DEFAULT_DIR = "allure-results";
const HISTORY_BASENAME = ".digest-history.json";
/** Consecutive result files whose mtimes are within this gap belong to the same run. */
const RUN_GAP_MS = 60_000;

function readResultFiles(dir: string): { file: string; mtimeMs: number }[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("-result.json"))
    .map((f) => {
      const full = path.join(dir, f);
      return { file: full, mtimeMs: fs.statSync(full).mtimeMs };
    });
}

/**
 * `allure-results/` accumulates every past run's files forever (nothing clears it between
 * `apitest run` invocations) — this isolates just the most recent run by walking backward
 * from the newest file and stopping at the first write-time gap bigger than `RUN_GAP_MS`.
 */
function selectLatestRun(files: { file: string; mtimeMs: number }[]): string[] {
  if (files.length === 0) return [];
  const sorted = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs);
  let cutoff = sorted.length - 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (sorted[i].mtimeMs - sorted[i - 1].mtimeMs > RUN_GAP_MS) {
      cutoff = i;
      break;
    }
    cutoff = i - 1;
  }
  return sorted.slice(cutoff).map((f) => f.file);
}

function firstLine(message: string | undefined): string {
  if (!message) return "(no error message captured)";
  return message.split("\n")[0].trim();
}

function tagsOf(result: AllureResult): string {
  const tags = (result.labels ?? []).filter((l) => l.name === "tag").map((l) => `@${l.value}`);
  return tags.length > 0 ? ` ${tags.join(" ")}` : "";
}

function loadHistory(historyFile: string): HistoryFile | undefined {
  if (!fs.existsSync(historyFile)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(historyFile, "utf-8")) as HistoryFile;
  } catch {
    return undefined;
  }
}

function saveHistory(historyFile: string, failing: Record<string, HistoryEntry>): void {
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  const data: HistoryFile = { recordedAt: new Date().toISOString(), failing };
  fs.writeFileSync(historyFile, JSON.stringify(data, null, 2), "utf-8");
}

export async function runDigest(options: DigestOptions): Promise<number> {
  const dir = options.dir ?? DEFAULT_DIR;
  const historyFile = options.historyFile ?? path.join(dir, HISTORY_BASENAME);

  const allFiles = readResultFiles(dir);
  if (allFiles.length === 0) {
    console.log(`No Allure results found in ${dir}/. Run "apitest run" first.`);
    return 0;
  }

  const latestRunFiles = selectLatestRun(allFiles);
  const results: AllureResult[] = latestRunFiles.map((f) => JSON.parse(fs.readFileSync(f, "utf-8")) as AllureResult);

  const passed = results.filter((r) => r.status === "passed").length;
  const failedResults = results.filter((r) => r.status === "failed" || r.status === "broken");
  const skipped = results.filter((r) => r.status === "skipped").length;

  console.log(
    `Allure digest — ${results.length} test(s) in the most recent run (${dir}/): ` +
      `${passed} passed, ${failedResults.length} failed, ${skipped} skipped.`
  );

  if (failedResults.length === 0) {
    console.log(`All green.`);
    // Still clear history so a future failure isn't misreported as "still failing" from a stale run.
    saveHistory(historyFile, {});
    return 0;
  }

  const currentFailing: Record<string, HistoryEntry> = {};
  for (const r of failedResults) {
    const id = r.historyId ?? r.fullName ?? r.name;
    currentFailing[id] = { name: r.name, message: firstLine(r.statusDetails?.message) };
  }

  const history = loadHistory(historyFile);
  const previousFailing = history?.failing ?? {};

  const newlyFailing = failedResults.filter((r) => !(r.historyId && r.historyId in previousFailing));
  const stillFailing = failedResults.filter((r) => r.historyId && r.historyId in previousFailing);
  const newlyFixedIds = Object.keys(previousFailing).filter((id) => !(id in currentFailing));

  if (!history) {
    console.log(`\n(No prior digest to compare against — next run will show new vs. persistent failures.)`);
  }

  if (newlyFailing.length > 0) {
    console.log(`\nNEW failures (${newlyFailing.length}):`);
    for (const r of newlyFailing) {
      console.log(`  ✗ ${r.name}${tagsOf(r)}`);
      console.log(`      ${firstLine(r.statusDetails?.message)}`);
    }
  }

  if (stillFailing.length > 0) {
    console.log(`\nSTILL FAILING (persisted since the last digest) (${stillFailing.length}):`);
    for (const r of stillFailing) {
      console.log(`  ✗ ${r.name}${tagsOf(r)}`);
      console.log(`      ${firstLine(r.statusDetails?.message)}`);
    }
  }

  if (newlyFixedIds.length > 0) {
    console.log(`\nNEWLY FIXED since the last digest (${newlyFixedIds.length}):`);
    for (const id of newlyFixedIds) {
      console.log(`  ✓ ${previousFailing[id].name}`);
    }
  }

  saveHistory(historyFile, currentFailing);

  console.log(`\n${newlyFailing.length} new, ${stillFailing.length} persistent, ${newlyFixedIds.length} newly fixed.`);
  return failedResults.length > 0 ? 1 : 0;
}
