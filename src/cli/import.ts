import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { loadConfig } from "./loadConfig.js";
import { loadSpec } from "../spec/loadSpec.js";
import type { OperationDescriptor } from "../spec/loadSpec.js";

/** Groups operations by their first OpenAPI tag, falling back to "untagged". */
function groupByTag(operations: Map<string, OperationDescriptor>, rawDoc: unknown): Map<string, OperationDescriptor[]> {
  const groups = new Map<string, OperationDescriptor[]>();
  const doc = rawDoc as { paths?: Record<string, Record<string, { tags?: string[]; operationId?: string }>> };
  for (const op of operations.values()) {
    const pathItem = doc.paths?.[op.pathTemplate];
    const rawOp = pathItem?.[op.method];
    const tag = rawOp?.tags?.[0] ?? "untagged";
    const list = groups.get(tag) ?? [];
    list.push(op);
    groups.set(tag, list);
  }
  return groups;
}

export async function runImport(): Promise<void> {
  const config = await loadConfig();
  const spec = await loadSpec(config.spec);
  const scenariosDir = config.scenariosDir ?? "scenarios";
  fs.mkdirSync(scenariosDir, { recursive: true });

  const groups = groupByTag(spec.operations, spec.raw);
  let written = 0;
  for (const [tag, ops] of groups) {
    const fileName = path.join(scenariosDir, `${tag}.scenario.yaml`);
    if (fs.existsSync(fileName)) {
      console.log(`Skipping ${fileName} — already exists.`);
      continue;
    }
    const doc = {
      name: tag,
      tags: [tag],
      steps: ops.map((op) => ({
        name: `TODO ${op.operationId}`,
        operation: op.operationId,
        ...(op.pathParams.length ? { params: Object.fromEntries(op.pathParams.map((p) => [p, "TODO"])) } : {}),
        ...(op.requestBodySchema ? { body: {} } : {}),
      })),
    };
    const schemaRelPath = path.relative(scenariosDir, "schemas/scenario.schema.json").split(path.sep).join("/");
    const content = `# yaml-language-server: $schema=${schemaRelPath}\n${stringify(doc)}`;
    fs.writeFileSync(fileName, content, "utf-8");
    written++;
  }
  console.log(`Wrote ${written} scenario stub file(s) to ${scenariosDir}/. Fill in TODO params/bodies before running.`);
}
