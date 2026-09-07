---
description: Analyze a failing or broken SpecPilot scenario/test and fix it when the failure is a test-authoring bug — never weaken assertions to paper over a real API defect.
---

# Test fixer

Fixes failing SpecPilot scenarios. `docs/scenario-format.md` and `docs/custom-steps.md` are the
source of truth for field syntax (read them before touching a `.scenario.yaml`/`.cases.yaml` or
`customSteps/*.ts` file).

## Step 1 — reproduce with the minimum surface

1. `npx apitest check` first — catches unknown `operationId`s/params with zero network calls. If
   this alone explains the failure, skip to the fix.
2. Re-run *only* the failing test(s) live:
   ```
   APITEST_ENV=<env> npx playwright test --grep "<scenario name>"
   ```
   (`<env>` defaults to `dev`, loaded from `environments/<env>.env`.) `npx apitest run --tag <tag>`
   also works if the failure is tag-scoped.
3. Read the actual error SpecPilot prints — status/schema mismatch, `$.jsonpath` value diff, or a
   thrown `Error` from a `custom:` step. Don't guess the cause from the scenario file alone.

## Step 2 — classify before touching anything

**Test-authoring bug (fix it):**
- Wrong expected value (spec/behavior changed, or the assertion was never verified live).
- Interpolation misuse — **`assert.jsonpath` does NOT support `{{var}}` interpolation.** Only
  `params`, `query`, `headers`, `body`, and assertion `equals`/`contains`/`oneOf`/`db`
  `query`/`params` are interpolated. A `jsonpath:` built from a var silently compares against the
  literal `"{{var}}"` text instead. If a check needs a runtime value inside the jsonpath
  expression itself, it needs a `custom:` step instead.
- **A step's own `extract:` isn't available to that same step's `assert:`** (`assert:` runs before
  `extract:` within one step). The fix is to move the assertion to the *next* step, not to reorder
  YAML fields — field order doesn't change execution order.
- Typo'd `operationId` — `apitest check` catches this.
- Typo'd `custom:` name — **`apitest check` does NOT verify these**, only a run does. Grep
  `customSteps/*.ts` for the export name yourself before assuming the step exists or writing a
  new one; grep for collisions too before adding a new export name.
- A `custom:` step's own logic has a bug — fix the `.ts` file, not the YAML.

**Not a test bug — report, don't "fix" by loosening the assertion:**
- The response genuinely doesn't match documented behavior (real API defect).
- An environment/config/routing issue outside the scenario file.
- A scenario deliberately asserting a security/behavior expectation the API doesn't currently meet
  — this red test documents a real gap. Confirm via `npx apitest describe <operationId>` and/or a
  raw request (`node -e` using `fetch`, loading `environments/<env>.env`) before concluding it's a
  genuine gap.

When genuinely unsure which bucket a failure is in, say so and show the evidence rather than
guessing either way.

## Step 3 — fix minimally

- Edit only the scenario YAML or the specific `customSteps/*.ts` file responsible. Don't refactor
  unrelated cases/steps while you're in the file.
- Never hand-edit generated files: `schemas/scenario.schema.json` (regen via `npx apitest schema`),
  `.spec-cache/` (regen via `npx apitest sync`), `runtime/scenario.spec.ts`.
- If the fix is "the assertion's expected value was stale," re-derive the correct value the same
  way this repo already does it elsewhere (live probe before hardening), not by copying the actual
  failing value back in without understanding why it changed.

## Step 4 — verify and report

1. `npx apitest check` again if you touched YAML.
2. Re-run the exact same scoped command from Step 1 to confirm green. Don't re-run the full suite
   unless asked.
3. Report per failure: root cause classification, what changed (file + one-line why), and the
   verification result. For anything left red on purpose, say so explicitly and why.

## Token-efficiency notes

- Use `npx apitest describe <operationId>` instead of reading `.spec-cache/spec.json` directly.
- Don't re-read a scenario file more than once — you already have it from Step 1.
- If more than one unrelated test is failing, they're independent — triage each separately rather
  than trying to fix a whole list in one pass.
