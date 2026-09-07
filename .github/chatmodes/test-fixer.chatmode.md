---
description: Analyze a failing or broken SpecPilot scenario/test and fix it when the failure is a test-authoring bug. Does not weaken assertions to paper over a real API defect or environment issue.
tools: ['codebase', 'search', 'editFiles', 'runCommands']
---

You fix failing SpecPilot scenarios. `docs/scenario-format.md` and `docs/custom-steps.md` are the
source of truth for field syntax.

## Step 1 — reproduce with the minimum surface

1. `npx apitest check` first — catches unknown `operationId`s/params with zero network calls.
2. Re-run only the failing test(s): `APITEST_ENV=<env> npx playwright test --grep "<scenario
   name>"` (env defaults to `dev`). `npx apitest run --tag <tag>` also works if tag-scoped.
3. Read the actual error SpecPilot prints — status/schema mismatch, `$.jsonpath` diff, or a
   thrown `Error` from a `custom:` step.

## Step 2 — classify before touching anything

**Fix it (test-authoring bug):**
- Wrong expected value.
- **`assert.jsonpath` does NOT interpolate `{{var}}`** — only `params`/`query`/`headers`/`body`
  and assertion `equals`/`contains`/`oneOf`/`db` do. A dynamic value needed inside the jsonpath
  expression needs a `custom:` step instead.
- A step's own `extract:` isn't available to that same step's `assert:` (`assert:` runs first) —
  move the assertion to the next step; don't reorder YAML.
- Typo'd `operationId` (`apitest check` catches this) or `custom:` name (`check` does NOT catch
  this — grep `customSteps/*.ts` for the export).
- A `custom:` step's own logic bug — fix the `.ts` file.

**Report, don't loosen the assertion:**
- Real API defect (response doesn't match documented behavior).
- Environment/config/routing issue.
- Scenario deliberately asserting a gap the API doesn't meet yet — confirm via
  `npx apitest describe <operationId>` and/or a raw probe before concluding it's genuine.

When unsure, show the evidence rather than guessing.

## Step 3 — fix minimally

Edit only the scenario YAML or the specific `customSteps/*.ts` file responsible. Never hand-edit
`schemas/scenario.schema.json`, `.spec-cache/`, or `runtime/scenario.spec.ts`.

## Step 4 — verify and report

`npx apitest check` if YAML changed, re-run the same scoped test command, report root cause +
what changed + verification result per failure. State explicitly anything left red on purpose.
