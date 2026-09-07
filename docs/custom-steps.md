# Custom steps — creation and usage

Custom steps are the framework's escape hatch: real, typed TypeScript functions for anything a
declarative `operation:` step can't express — setup/seeding, transforming an already-extracted
value, multi-call logic, or guaranteed cleanup. They're looked up by export name via a real
`import()`, never a spliced string or `eval` (see `src/interpreter/customStepRegistry.ts`).

---

## Creating one

Add a `.ts`, `.js`, or `.mjs` file directly under `customSteps/` (any name, `.d.ts` files are
skipped) exporting a `const` typed as `CustomStep`:

```ts
// customSteps/randomAddress.ts
import type { CustomStep } from "@assertquest/specpilot/types/customStep";

export const randomAddress: CustomStep = async (ctx) => {
  const suffix = Math.floor(Math.random() * 100000);
  ctx.vars.pickupLabel = `Warehouse A (test-${suffix})`;
};
```

That's the whole registration step — there's no separate registry file to edit. At startup,
`loadCustomSteps()` reads every file directly under `customSteps/` (not recursive — files in
subfolders are ignored), dynamically imports each one, and registers **every function-valued
named export** under its own export name. A few consequences worth knowing:

- **One file can export several custom steps.** `bookingLifecycle.ts` in this repo exports
  `generateBookingLabels`, `normalizeShipmentId`, and `advanceTestShipment` — all three are
  registered independently.
- **The export name is what matters, not the filename.** `custom: randomAddress` in a scenario
  looks up the export named `randomAddress`, regardless of which file it lives in.
- **If two files export the same name, whichever loads last silently wins.** Keep export names
  unique across the whole `customSteps/` directory.
- The registry is built once per worker process and cached — editing a custom step file requires
  re-running the tests (same as any other code change), not a special reload step.

## `ctx: StepContext` — what a custom step receives

```ts
export interface StepContext {
  request: APIRequestContext;                 // unauthenticated Playwright request context
  roleRequest: (role: string) => Promise<APIRequestContext>; // authenticated context for a given auth role
  spec: Map<string, OperationDescriptor>;      // the full synced spec, keyed by operationId
  db: (connectionName: string) => Promise<DbAdapter>; // opens (or reuses) a configured db connection
  vars: Record<string, unknown>;               // the scenario's shared variable bag
  defaultAuth?: string;                        // the scenario/case-level `auth:` role, if any
}
```

- **`vars`** is the *same object* the interpreter uses for `{{var}}` interpolation and
  `extract:` — read from it, write to it, and later steps (and `cleanup:`) see the changes
  immediately. This is how setup and transformation custom steps communicate with the rest of
  the scenario.
- **`roleRequest(role)`** returns a Playwright `APIRequestContext` with that role's auth headers
  already applied (bearer token, basic auth, api key, etc. — resolved the same way a regular
  `operation:` step resolves `auth:`). Use `ctx.defaultAuth` if you want "whatever this scenario's
  default role is" rather than hardcoding a role name.
- **`request`** is a plain, unauthenticated context — same base URL, no auth headers.
- **`spec`** lets a custom step look up an operation's path/method/schema directly if it needs to
  build a request by hand rather than going through the interpreter's usual `runStep` machinery
  (rare — usually you'd rather just add a normal `operation:` step before or after the custom one).
- **`db(name)`** opens (or reuses, within the worker) the named connection from
  `apitest.config.ts`'s `db.connections` — same adapter interface (`query`, `withTransaction`,
  `close`) used by the declarative `db:` assertion. Prefer a named query from `queries/` (e.g.
  `queries/shipments.ts`'s `getShipmentById(db, id)`) over hand-writing SQL inline — see
  CLAUDE.md's "`queries/` — the named SQL query library" section.

A custom step's raw HTTP calls (via `ctx.request`/`ctx.roleRequest`) are **not** automatically
wrapped with the "Request"/"Response" Allure attachments or the automatic status/schema check
that `operation:` steps get for free — those live in `runStep.ts`/`runAssertion.ts`, which a
custom step bypasses entirely. If you need that reporting detail for a call made from inside a
custom step, attach it yourself via `test.info().attach(...)`, or reconsider whether it should
really be a normal `operation:` step instead.

## Using one from a scenario

Reference it with `custom:` instead of `operation:` on a step — the two are mutually exclusive
(`apitest check`/the Zod schema both enforce exactly one):

```yaml
steps:
  - custom: randomAddress
  - name: create booking
    operation: post_api-booking
    body:
      origin:
        label: "{{pickupLabel}}"   # written by the custom step above
        ...
```

The same mechanism also backs the scenario-level `cleanup:` field — it's just a `custom:`
reference that the interpreter guarantees to run after the steps finish, pass or fail:

```yaml
name: booking-lifecycle-demo
cleanup: advanceTestShipment
steps:
  - ...
```

See `docs/scenario-format.md` for the full field reference, and `customSteps/bookingLifecycle.ts`
/ `scenarios/booking-lifecycle-demo.scenario.yaml` in this repo for a complete worked example
covering setup, transforming an extracted value, and guaranteed cleanup together.

## The three shapes custom steps are for

**1. Setup** — compute data before the real flow starts:

```ts
export const generateBookingLabels: CustomStep = async (ctx) => {
  const runId = Date.now().toString(36);
  ctx.vars.pickupLabel = `Warehouse A (test-${runId})`;
  ctx.vars.dropoffLabel = `Customer Site (test-${runId})`;
};
```

**2. Transform** — rewrite a value an earlier step already `extract`ed:

```ts
export const normalizeShipmentId: CustomStep = async (ctx) => {
  ctx.vars.shipmentId = String(ctx.vars.shipmentId).trim().toLowerCase();
};
```

**3. Cleanup** — referenced via the scenario's `cleanup:` field, not `custom:` on a step, so it
runs even when an earlier step throws:

```ts
export const advanceTestShipment: CustomStep = async (ctx) => {
  if (!ctx.vars.shipmentId) return; // nothing was created yet — e.g. setup itself failed
  const roleRequest = await ctx.roleRequest(ctx.defaultAuth ?? "swiftCargoBearer");
  await roleRequest.fetch(`/api/tracking/${ctx.vars.shipmentId}/advance`, { method: "POST", data: {} });
};
```

## Errors and troubleshooting

- **`Unknown custom step "X" — no export by that name found under customSteps/.`** — the
  interpreter lists every currently-registered export name in the error itself. Usually means a
  typo in `custom: X`, or the file wasn't saved/exists somewhere other than directly under
  `customSteps/`.
- `apitest check` does **not** verify a `custom:` name resolves to a real export — it only warns
  if `customSteps/` is empty entirely. A typo'd custom step name is only caught at actual run
  time, unlike a typo'd `operation:` (which `check` does verify against the synced spec). Keep
  this in mind when relying on `check` alone before a run.
- No `eval`/`new Function`/string interpolation is ever used to invoke a custom step — it's a
  real dynamic `import()` of your `.ts` file, so normal TypeScript type-checking, refactoring
  tools, and IDE "go to definition" all work on custom steps exactly as they would on any other
  code in the project.
