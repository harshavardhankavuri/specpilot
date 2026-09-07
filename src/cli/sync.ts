// `apitest sync`: fetches the OpenAPI spec from config.spec and writes it into
// .spec-cache/spec.json, the snapshot that check/run/describe/drift read from.
import { loadConfig } from "./loadConfig.js";
import { loadSpec, writeSpecCache } from "../spec/loadSpec.js";

export async function runSync(): Promise<void> {
  const config = await loadConfig();
  console.log(`Fetching spec from ${config.spec} ...`);
  const spec = await loadSpec(config.spec);
  await writeSpecCache(spec, config.specCacheDir);
  console.log(`Synced ${spec.operations.size} operation(s) into ${config.specCacheDir ?? ".spec-cache"}/spec.json.`);
}
