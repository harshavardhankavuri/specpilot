---
description: Given one SpecPilot scenario/cases file, audit its existing steps/cases against the full test checklist and report what's covered, missing, or good-to-have — read-only.
---

# Coverage auditor

Codex CLI has no tool-restricted subagent concept, so this is a *behavioral* contract, not an
enforced one: while running this prompt, treat yourself as **read-only**. Never edit the target
file, never write a new file, and never call the live API (no `POST`/`PUT`/`DELETE` probes, no
`apitest run`, no `--sync`). This is a static analysis of the file against the already-synced
spec — the companion to `checklist-cases`, which does the generating; this only does the listing.
Field syntax is `docs/scenario-format.md`, custom step contract is `docs/custom-steps.md`.

## Step 1 — read the target and find its operation surface

1. Read the given file in full.
2. Collect every distinct `operationId` referenced by an `operation:` field across `steps:` and
   every `cases:` entry.
3. If `.spec-cache/` is missing, tell the user to run `npx apitest sync` first rather than
   fetching the spec yourself.
4. For each operationId, pull its descriptor from the cache in one call:
   ```
   npx apitest describe <operationId> [<operationId> ...]
   ```
5. Check `apitest.config.ts` for how many `auth.roles` exist — RBAC coverage only matters if
   there's more than one role to distinguish.

## Step 2 — work out what's applicable, same scoping as checklist-cases

| Category | Applicable when |
|---|---|
| Create/Read/Update/Delete | Per HTTP method that actually exists for this resource in the spec. |
| Missing required field / wrong type / boundary / extra field | `requestBodySchema` has `required`/`type`/`minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`/`enum` to violate. |
| SQLi/XSS payload | Any free-text string property in the body. |
| Status codes | Only codes actually in `responses` — the automatic per-step check already covers "response matches its documented schema" for free. |
| Auth (missing/invalid/role) | Operation requires auth, and multiple roles exist worth distinguishing. |
| Pagination/filtering | Only if `requiredQueryParams`/`optionalQueryParams` include paging/filter params. |
| Data integrity (duplicate creation, referential integrity, concurrency) | POST/PUT operations; concurrency specifically needs a `custom:` `Promise.all` step — grep `customSteps/*.ts` for one that already targets this operation before assuming it's missing. |
| Contract/schema drift | Out of scope for a single scenario file — that's `apitest drift`'s job. Don't flag it. |

## Step 3 — classify what's already covered

Scan every existing case/step and match it to a category by its actual content, not its name:

- **CRUD/role access**: which HTTP methods are exercised, and which roles are proven allowed
  (2xx) vs. forbidden (401/403) per operation.
- **Input validation**: omitted required field, wrong type, boundary (at limit and just past),
  enum outside the set, unexpected field, XSS/SQLi payload — matched against Step 1's concrete
  constraints.
  - **`assert.jsonpath` does not interpolate `{{var}}`.** A `jsonpath:` string built from a
    `{{var}}` is a likely-broken assertion (compares against literal unresolved text), not
    coverage.
  - A step's own `extract:` isn't available to that same step's `assert:` — flag a case doing
    both in one step as broken, not extra coverage.
- **Status/response**: which documented status codes have a case asserting them.
- **Data integrity**: duplicate/concurrent-write cases, referential-integrity cases. Concurrency
  must use a `custom:` step with `Promise.all` — two sequential `operation:` steps is fake
  coverage.
- **Reliability**: malformed-JSON-on-the-wire, rate-limit probes — almost always `custom:` steps.

## Step 4 — report

Three buckets, using the same category names as `checklist-cases` so a follow-up lines up:

1. **Covered** — one line per category with what proves it (case name).
2. **Missing** — applicable categories with zero covering case, what a case would need to assert
   (concrete boundary value / role / status code, not vague), and whether it needs a `custom:`
   step or is plain declarative.
3. **Good-to-have** — partial coverage, unverified-looking assertions, or edge variants.

**Cap the report at 10 items** across Missing + Good-to-have by default (highest-value first),
ending with "+N more not shown — ask for the full list if you want it" if truncated. Don't pad a
short list back up to 10.

End with: *"Run the `checklist-cases` prompt for `<operationId>` to fill the missing categories
above"* — you list gaps, you don't fill them yourself.

## Token-efficiency notes

- Use `npx apitest describe` instead of reading `.spec-cache/spec.json` directly.
- Don't re-read the full target file more than once.
- If asked to audit several files, treat them as independent tasks — do them one at a time and
  say so if handed a whole directory in one request instead of file-by-file.
