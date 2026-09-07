---
mode: agent
description: Add a typed CustomStep export to customSteps/ for setup, transform, or cleanup logic that a declarative operation step can't express.
tools: ['codebase', 'search', 'editFiles']
---

Full contract lives in `docs/custom-steps.md` — read that instead of
`src/interpreter/customStepRegistry.ts`.

**Before writing anything:** grep `customSteps/*.ts` for the export name you're about to use.
Registration is by export name, process-wide across every file directly under `customSteps/` (not
recursive) — a duplicate name means whichever file loads last silently wins, with no error.

Three shapes, pick one:

1. **Setup** — compute data before the flow starts, write to `ctx.vars`:
   ```ts
   export const myStep: CustomStep = async (ctx) => {
     ctx.vars.someValue = "...";
   };
   ```
2. **Transform** — rewrite a value an earlier step's `extract:` already put in `ctx.vars`.
3. **Cleanup** — referenced via the scenario's `cleanup:` field, guaranteed to run after steps
   finish whether they passed or failed. Guard on the var it depends on:
   ```ts
   export const myCleanup: CustomStep = async (ctx) => {
     if (!ctx.vars.someId) return;
     const roleRequest = await ctx.roleRequest(ctx.defaultAuth ?? "<default-role>");
     await roleRequest.fetch(`/api/...`, { method: "POST", data: {} });
   };
   ```

Writing the file:
- New or existing file under `customSteps/` — file name doesn't matter, only the export name.
- `import type { CustomStep } from "@assertquest/specpilot/types/customStep";`
- `ctx: StepContext` gives: `request` (unauthenticated), `roleRequest(role)` (authenticated),
  `spec` (Map of operationId → descriptor), `db(connectionName)`, `vars`, `defaultAuth`.
- Raw HTTP calls via `ctx.request`/`ctx.roleRequest` do **not** get the automatic Allure
  attachment or automatic status/schema check — reconsider using a normal `operation:` step if you
  need that.

Wiring: `steps: - custom: myStep` or `cleanup: myCleanup`.

**Verifying:** `npx apitest check` does NOT validate `custom:`/`cleanup:` names — only an actual
`npx apitest run` resolves them (`Unknown custom step "X"` if missing).

Don't paste the whole `docs/custom-steps.md` back — quote only the shape relevant to the step
being added.
