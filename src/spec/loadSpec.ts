import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import fs from "node:fs";
import path from "node:path";
import type { HttpMethod } from "../types/config.js";

export type JsonSchema = Record<string, unknown>;

export interface OperationDescriptor {
  operationId: string;
  method: HttpMethod;
  pathTemplate: string;
  pathParams: string[];
  requiredQueryParams: string[];
  optionalQueryParams: string[];
  requestBodySchema?: JsonSchema;
  responses: Record<string, { schema?: JsonSchema }>;
  security?: string[];
  /** True if the spec had no operationId and `slugify` generated one from method+path. */
  synthesizedId?: boolean;
}

export interface LoadedSpec {
  operations: Map<string, OperationDescriptor>;
  servers: string[];
  securitySchemes: Record<string, unknown>;
  raw: OpenAPIV3.Document | OpenAPIV3_1.Document;
}

const HTTP_METHODS: HttpMethod[] = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];

function slugify(method: string, pathTemplate: string): string {
  const slug = pathTemplate
    .replace(/[{}]/g, "")
    .split("/")
    .filter(Boolean)
    .join("-");
  return `${method}_${slug || "root"}`;
}

/**
 * Detects the common "pointed the tool at a rendered Swagger UI HTML page" mistake
 * so init/sync fail with an actionable message instead of a cryptic parser error.
 */
function assertNotHtml(content: string, sourceLabel: string): void {
  const trimmed = content.trimStart().slice(0, 200).toLowerCase();
  if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) {
    throw new Error(
      `"${sourceLabel}" looks like an HTML page (likely a rendered Swagger UI), not a raw OpenAPI ` +
        `document. Point this at the JSON/YAML spec file itself — usually available at a path like ` +
        `"/openapi.json", "/swagger.json", or linked from the Swagger UI page as "Raw" / "Download".`,
    );
  }
}

async function fetchSpecSource(specUrlOrPath: string): Promise<unknown> {
  if (/^https?:\/\//i.test(specUrlOrPath)) {
    const res = await fetch(specUrlOrPath);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch OpenAPI spec from ${specUrlOrPath}: HTTP ${res.status} ${res.statusText}`,
      );
    }
    const text = await res.text();
    assertNotHtml(text, specUrlOrPath);
    return specUrlOrPath;
  }
  const abs = path.resolve(specUrlOrPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`OpenAPI spec file not found: ${abs}`);
  }
  const text = fs.readFileSync(abs, "utf-8");
  assertNotHtml(text, abs);
  return abs;
}

/**
 * `bundle()` (unlike `dereference()`) leaves internal $refs like
 * "#/components/schemas/Booking" intact so cyclic schemas stay JSON-serializable
 * for the spec cache. That means a lone response/request schema isn't
 * self-contained for a validator — so we carry `components` alongside it, which
 * lets Ajv resolve any "#/components/..." pointer against the same root object.
 */
function extractSchemaFromContent(
  content: OpenAPIV3.MediaTypeObject | undefined,
  components: OpenAPIV3.ComponentsObject | undefined,
): JsonSchema | undefined {
  if (!content?.schema) return undefined;
  return {
    ...(content.schema as JsonSchema),
    components: components as unknown,
  };
}

/**
 * Fetches (URL) or reads (file path) an OpenAPI 3.x document, bundles internal $refs, and
 * flattens every path/method into an `OperationDescriptor` keyed by operationId.
 *
 * Missing operationIds and collisions are non-fatal: a missing one is synthesized via
 * `slugify` (method + path), and a duplicate id just logs a warning and lets the later
 * definition overwrite the earlier one in the returned map — scenarios reference operations
 * by operationId, so a stable, unique id matters more than failing the whole sync over it.
 */
export async function loadSpec(specUrlOrPath: string): Promise<LoadedSpec> {
  const source = await fetchSpecSource(specUrlOrPath);

  let doc: OpenAPIV3.Document | OpenAPIV3_1.Document;
  try {
    doc = (await SwaggerParser.bundle(source as string)) as OpenAPIV3.Document;
  } catch (err) {
    throw new Error(
      `Failed to parse "${specUrlOrPath}" as an OpenAPI 3.x document: ${(err as Error).message}`,
    );
  }

  if (
    !("openapi" in doc) ||
    !String((doc as OpenAPIV3.Document).openapi ?? "").startsWith("3")
  ) {
    throw new Error(
      `"${specUrlOrPath}" does not look like an OpenAPI 3.x document (missing/unsupported "openapi" version field). ` +
        `Swagger 2.0 ("swagger: '2.0'") documents are not supported — convert to OpenAPI 3.x first.`,
    );
  }

  const operations = new Map<string, OperationDescriptor>();
  const seenIds = new Set<string>();
  const warnings: string[] = [];

  for (const [pathTemplate, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem) continue;
    const pathLevelParams = ((pathItem as OpenAPIV3.PathItemObject)
      .parameters ?? []) as OpenAPIV3.ParameterObject[];

    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, unknown>)[method] as
        | OpenAPIV3.OperationObject
        | undefined;
      if (!op) continue;

      let operationId = op.operationId;
      let synthesized = false;
      if (!operationId) {
        operationId = slugify(method, pathTemplate);
        synthesized = true;
        warnings.push(
          `Operation "${method.toUpperCase()} ${pathTemplate}" has no operationId; synthesized "${operationId}". ` +
            `Add an explicit operationId in the spec for a stable reference.`,
        );
      }
      if (seenIds.has(operationId)) {
        warnings.push(
          `Duplicate operationId "${operationId}" — later definition overwrites the earlier one.`,
        );
      }
      seenIds.add(operationId);

      const allParams = [
        ...pathLevelParams,
        ...((op.parameters ?? []) as OpenAPIV3.ParameterObject[]),
      ];
      const pathParams = allParams
        .filter((p) => p.in === "path")
        .map((p) => p.name);
      const requiredQueryParams = allParams
        .filter((p) => p.in === "query" && p.required)
        .map((p) => p.name);
      const optionalQueryParams = allParams
        .filter((p) => p.in === "query" && !p.required)
        .map((p) => p.name);

      const requestBodySchema = op.requestBody
        ? extractSchemaFromContent(
            (op.requestBody as OpenAPIV3.RequestBodyObject).content?.[
              "application/json"
            ],
            doc.components,
          )
        : undefined;

      const responses: Record<string, { schema?: JsonSchema }> = {};
      for (const [status, responseObj] of Object.entries(op.responses ?? {})) {
        const schema = extractSchemaFromContent(
          (responseObj as OpenAPIV3.ResponseObject).content?.[
            "application/json"
          ],
          doc.components,
        );
        responses[status] = { schema };
      }

      operations.set(operationId, {
        operationId,
        method,
        pathTemplate,
        pathParams,
        requiredQueryParams,
        optionalQueryParams,
        requestBodySchema,
        responses,
        security: op.security?.flatMap((s) => Object.keys(s)),
        synthesizedId: synthesized,
      });
    }
  }

  if (warnings.length > 0) {
    for (const w of warnings) console.warn(`[apitest] spec warning: ${w}`);
  }

  const servers = (doc.servers ?? []).map((s) => s.url);
  const securitySchemes =
    (doc.components as OpenAPIV3.ComponentsObject | undefined)
      ?.securitySchemes ?? {};

  return {
    operations,
    servers,
    securitySchemes: securitySchemes as Record<string, unknown>,
    raw: doc,
  };
}

export function specCachePath(cacheDir = ".spec-cache"): string {
  return path.join(cacheDir, "spec.json");
}

export async function writeSpecCache(
  spec: LoadedSpec,
  cacheDir = ".spec-cache",
): Promise<void> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const serializable = {
    operations: Array.from(spec.operations.entries()),
    servers: spec.servers,
    securitySchemes: spec.securitySchemes,
  };
  fs.writeFileSync(
    specCachePath(cacheDir),
    JSON.stringify(serializable, null, 2),
    "utf-8",
  );
}

/**
 * Reads back what `writeSpecCache` persisted. Note `raw` is NOT restored — only
 * operations/servers/securitySchemes are cached — so callers needing the full parsed
 * OpenAPI document must call `loadSpec` directly instead of going through the cache.
 */
export function readSpecCache(cacheDir = ".spec-cache"): LoadedSpec {
  const file = specCachePath(cacheDir);
  if (!fs.existsSync(file)) {
    throw new Error(
      `No cached spec found at ${file}. Run "apitest sync" before running or checking scenarios ` +
        `(Playwright requires test collection to be synchronous, so the spec must be fetched ahead of time).`,
    );
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    operations: [string, OperationDescriptor][];
    servers: string[];
    securitySchemes: Record<string, unknown>;
  };
  return {
    operations: new Map(parsed.operations),
    servers: parsed.servers,
    securitySchemes: parsed.securitySchemes,
    raw: {} as OpenAPIV3.Document,
  };
}
