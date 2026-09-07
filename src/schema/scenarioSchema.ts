import { z } from "zod";

const assertionSchema = z
  .object({
    status: z.number().int().optional(),
    jsonpath: z.string().optional(),
    header: z.string().optional(),
    equals: z.unknown().optional(),
    contains: z.unknown().optional(),
    exists: z.boolean().optional(),
    matches: z.string().optional(),
    oneOf: z.array(z.unknown()).optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    greaterThan: z.number().optional(),
    lessThan: z.number().optional(),
    greaterThanOrEqual: z.number().optional(),
    lessThanOrEqual: z.number().optional(),
    bodyStartsWith: z.string().optional(),
    bodyMinBytes: z.number().optional(),
    bodyMaxBytes: z.number().optional(),
    db: z.string().optional(),
    query: z.string().optional(),
    params: z.array(z.unknown()).optional(),
    expectRow: z.record(z.unknown()).optional(),
  })
  .strict();

const stepSchema = z
  .object({
    name: z.string().optional(),
    operation: z.string().optional(),
    custom: z.string().optional(),
    auth: z.string().optional(),
    params: z.record(z.unknown()).optional(),
    query: z.record(z.unknown()).optional(),
    headers: z.record(z.unknown()).optional(),
    body: z.unknown().optional(),
    extract: z.record(z.string()).optional(),
    assert: z.array(assertionSchema).optional(),
  })
  .strict()
  .refine((s) => Boolean(s.operation) || Boolean(s.custom), {
    message: "step must set either `operation` or `custom`",
  })
  .refine((s) => !(s.operation && s.custom), {
    message: "step cannot set both `operation` and `custom`",
  });

const caseSchema = z
  .object({
    name: z.string(),
    steps: z.array(stepSchema).min(1),
  })
  .strict();

const dbHooksSchema = z
  .object({
    connection: z.string().optional(),
    seed: z.string().optional(),
    rollback: z.boolean().optional(),
  })
  .strict();

export const scenarioFileSchema = z
  .object({
    name: z.string(),
    tags: z.array(z.string()).optional(),
    auth: z.string().optional(),
    db: dbHooksSchema.optional(),
    steps: z.array(stepSchema).min(1).optional(),
    cases: z.array(caseSchema).min(1).optional(),
    cleanup: z.string().optional(),
  })
  .strict()
  .refine((s) => Boolean(s.steps) || Boolean(s.cases), {
    message: "scenario file must define either `steps` (a chained flow) or `cases` (independent edge cases)",
  });

export type ScenarioFileInput = z.infer<typeof scenarioFileSchema>;
