---
name: add-custom-step
description: Add a typed CustomStep export to customSteps/ for setup, transform, or cleanup logic that a declarative operation step can't express, following SpecPilot's export-name registration contract.
---

# Add a SpecPilot custom step

Full contract lives in `docs/custom-steps.md` — read that instead of
`src/interpreter/customStepRegistry.ts`. This skill is the fast path plus the collision check
that's easy to skip.

## Before writing anything

Grep `customSteps/*.ts` for the export name you're about to use. Registration is by export name,
not filename, and it's process-wide across every file directly under `customSteps/` (not
recursive) — a duplicate name means whichever file loads last silently wins, with no error.

## The three shapes (pick one)

1. **Setup** — compute data before the flow starts, write it to `ctx.vars`:
   ```ts
   export const myStep: CustomStep = async (ctx) => {
     ctx.vars.someValue = "...";
   };
   ```
2. **Transform** — rewrite a value an earlier step's `extract:` already put in `ctx.vars`.
3. **Cleanup** — referenced via the scenario's `cleanup:` field (not a step's `custom:`), guaranteed
   to run after steps finish whether they passed or failed. Guard on the var it depends on:
   ```ts
   export const myCleanup: CustomStep = async (ctx) => {
     if (!ctx.vars.someId) return; // nothing was created — e.g. setup itself failed
     const roleRequest = await ctx.roleRequest(ctx.defaultAuth ?? "<default-role>");
     await roleRequest.fetch(`/api/...`, { method: "POST", data: {} });
   };
   ```

## Writing the file

- New file or an existing one under `customSteps/` — file name doesn't matter, only the export name.
- Import the type: `import type { CustomStep } from "apitest-framework/types/customStep";`
- `ctx: StepContext` gives you: `request` (unauthenticated), `roleRequest(role)` (authenticated,
  same resolution as a declarative `auth:`), `spec` (Map of operationId → descriptor, rarely
  needed — prefer a normal `operation:` step before/after instead of hand-building a request),
  `db(connectionName)` (same adapter as the declarative `db:` assertion), `vars` (the same object
  used for `{{var}}` interpolation — read/write it directly), `defaultAuth`.
- Raw HTTP calls made via `ctx.request`/`ctx.roleRequest` inside a custom step do **not** get the
  automatic Allure request/response attachment or the automatic status/schema check that
  `operation:` steps get — if you need that, reconsider whether this should be a normal
  `operation:` step instead of a custom one.

## Wiring it into a scenario

```yaml
steps:
  - custom: myStep
```
or, for cleanup:
```yaml
cleanup: myCleanup
```

## Verifying

`npx apitest check` does **not** validate `custom:`/`cleanup:` names — only an actual
`npx apitest run` resolves them, raising `Unknown custom step "X"` (with every currently
registered name listed) if it's missing. Don't rely on `check` alone here.

## Token-efficiency notes

- Don't paste the whole `docs/custom-steps.md` back to the user — quote only the shape (setup/
  transform/cleanup) relevant to the step being added.
- Read `customSteps/bookingLifecycle.ts` only if you need a concrete worked example beyond what's
  in this skill — it's already summarized above.
