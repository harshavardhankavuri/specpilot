---
description: Scaffold a new SpecPilot scenario or case file (*.scenario.yaml / *.cases.yaml) against a synced OpenAPI operationId.
---

# Add a SpecPilot scenario

Field reference lives in `docs/scenario-format.md` — read that instead of
`src/schema/scenarioSchema.ts`. This prompt is just the fast path.

## Steps

1. **Find the operationId(s).** Check `.spec-cache/` (written by `npx apitest sync`) or ask the
   user which operation(s) this scenario covers. If `.spec-cache/` looks stale or missing, run
   `npx apitest sync` first.
2. **Decide `steps:` vs `cases:`.**
   - `steps:` — one chained flow, one Playwright test, later steps depend on earlier `extract:`ed vars.
   - `cases:` — independent tests sharing the same file-level `name`/`auth`/`tags`/`cleanup`, each
     with its own `steps:` and no shared vars between cases.
   - Both may coexist in one file.
3. **Write the file** under `scenarios/`, named `<topic>.scenario.yaml` (chained flow) or
   `<topic>.cases.yaml` (edge cases) — this suffix is convention only, not enforced by the loader.
   Start the file with the schema pragma so editor IntelliSense works:
   ```yaml
   # yaml-language-server: $schema=../schemas/scenario.schema.json
   ```
4. **Use `operation:` for anything the spec can express directly.** Only reach for `custom:` (see
   the `add-custom-step` prompt) for setup, transforms, or multi-call logic the spec can't express.
5. **Every step already gets** a status-in-spec check and a JSON schema check for free — don't
   hand-write `assert: - status: N` unless you need a status *narrower* than "documented", and only
   add `assert:` entries for behavior beyond that (specific field values, header checks, db checks).
6. **Validate before running:** `npx apitest check` (verifies every `operation:`'s operationId/params
   against the synced spec — it does NOT check `custom:` names, see below).
7. **If you used `custom:`,** grep `customSteps/*.ts` for that exact export name — `check` won't
   catch a typo there, only an actual `apitest run` will.

## Common field pitfalls (full detail in docs/scenario-format.md)

- Exactly one of `operation`/`custom` per step — never both, never neither.
- `extract:` uses JSONPath against the parsed response body; a non-matching path yields
  `undefined`, which later throws `Unresolved placeholder` rather than silently interpolating.
- `auth: "none"` (literal string) sends the request with no auth at all — different from omitting
  `auth:`, which falls back to the scenario/case default.
- `headers:` on a step merge over (and can override) whatever the resolved auth role sets — use
  this for negative-auth tests instead of switching the whole scenario off auth.
- Raw-body assertions (`bodyStartsWith`/`bodyMinBytes`/`bodyMaxBytes`) are for non-JSON responses
  (PDF/CSV) where the automatic schema check is silently skipped.
- The `db:` top-level scenario field is schema-accepted but NOT wired up in the interpreter yet —
  use a `custom:` setup step + `cleanup:` instead for now.

## Token-efficiency notes

- Don't read the full `.spec-cache/spec.json` into context to find one operationId — grep it for
  the `operationId:` string, or ask the user, instead of loading the whole synced doc.
- Don't re-read `docs/scenario-format.md` in full if you already have it from earlier in this
  session — only re-check the specific field you're unsure about.
