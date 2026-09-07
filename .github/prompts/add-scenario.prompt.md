---
mode: agent
description: Scaffold a new SpecPilot scenario or case file (*.scenario.yaml / *.cases.yaml) against a synced OpenAPI operationId.
tools: ['codebase', 'search', 'editFiles', 'runCommands']
---

Field reference lives in `docs/scenario-format.md` — read that instead of
`src/schema/scenarioSchema.ts`. This is the fast path.

1. **Find the operationId(s).** Check `.spec-cache/` (written by `npx apitest sync`) or ask which
   operation(s) this scenario covers. If `.spec-cache/` looks stale or missing, run
   `npx apitest sync` first.
2. **Decide `steps:` vs `cases:`.**
   - `steps:` — one chained flow, one Playwright test, later steps depend on earlier `extract:`ed vars.
   - `cases:` — independent tests sharing file-level `name`/`auth`/`tags`/`cleanup`, each with its
     own `steps:`, no shared vars between cases. Both may coexist in one file.
3. **Write the file** under `scenarios/`, named `<topic>.scenario.yaml` or `<topic>.cases.yaml`
   (convention only). Start with:
   ```yaml
   # yaml-language-server: $schema=../schemas/scenario.schema.json
   ```
4. **Use `operation:` for anything the spec can express directly.** Only reach for `custom:` for
   setup, transforms, or multi-call logic the spec can't express (see the `add-custom-step`
   prompt).
5. Every step already gets a free status-in-spec check and JSON schema check — only add `assert:`
   for behavior beyond that.
6. **Validate:** `npx apitest check` (verifies `operation:` operationId/params — does NOT check
   `custom:` names).
7. If you used `custom:`, grep `customSteps/*.ts` for that exact export name — `check` won't catch
   a typo there.

Common pitfalls (full detail in `docs/scenario-format.md`):
- Exactly one of `operation`/`custom` per step.
- `extract:` uses JSONPath; a non-matching path yields `undefined`, throwing `Unresolved
  placeholder` later.
- `auth: "none"` sends no auth at all — different from omitting `auth:` (falls back to
  scenario/case default).
- `headers:` on a step merges over the resolved auth role's headers — use for negative-auth tests.
- Raw-body assertions (`bodyStartsWith`/`bodyMinBytes`/`bodyMaxBytes`) are for non-JSON responses.
- The `db:` top-level scenario field is schema-accepted but not wired up — use a `custom:` setup
  step + `cleanup:` instead.

Don't dump `.spec-cache/spec.json` into the conversation to find one operationId — grep it, or
ask instead.
