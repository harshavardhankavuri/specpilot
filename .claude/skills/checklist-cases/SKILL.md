---
name: checklist-cases
description: Generate the CRUD/validation/status/auth/data-integrity `cases:` checklist for one operationId against the synced spec, deriving concrete boundary/negative payloads from its schema and confirming role/status behavior live before writing any assertion.
---

# Generate checklist cases for an operation

Fast path for the standard test checklist (CRUD, input validation, status codes, auth/RBAC,
data integrity, pagination) applied to one `operationId`, in the style of
`scenarios/bookings/booking-flow.scenario.yaml`'s `cases:` block. Field syntax is
`docs/scenario-format.md`; custom step contract is `docs/custom-steps.md` — read those instead
of re-deriving syntax from source.

## Steps

1. **Get the operation.** Ensure `.spec-cache/` is fresh (`npx apitest sync` if stale/missing).
   Pull the one operation's descriptor rather than loading the whole spec:
   ```
   npx apitest describe <operationId>
   ```
   This prints method, path/path params, required/optional query params, the request body's
   fields (with `required`/`minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`/`enum`/
   `format` constraints, one level of nested `$ref` resolved) and documented response codes —
   everything steps 2–3 need, already formatted. Pass several operationIds in one call
   (`npx apitest describe opA opB opC`) instead of invoking it once per operation. Fall back to
   `node -e "const m=new Map(require('./.spec-cache/spec.json').operations); console.log(JSON.stringify(m.get('<operationId>'),null,2))"`
   only if you need a raw field `describe` doesn't surface (e.g. `security` scheme names beyond
   "requires auth", or a schema nested more than one level deep). A category with no matching
   documented status/constraint is out of scope — don't invent one.

2. **Scope the checklist to what this operation can actually express** — don't generate a case
   for a category the operation has no shape for:

   | Checklist category | Applies when |
   |---|---|
   | Create/Read/Update/Delete | Per HTTP method actually present for this resource — most resources only have some of POST/GET/PUT/PATCH/DELETE. Don't fabricate an update/delete case if no such operation exists. |
   | Missing required field / wrong type / boundary / extra field | `requestBodySchema` exists and has `required`/`type`/`minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`/`enum` constraints to derive from. |
   | SQLi/XSS in a string field | Any free-text string property in the body. |
   | Status codes | Only assert codes that appear in `responses` — anything else is what the automatic per-step status/schema check already covers for free. |
   | Auth (missing/invalid/role) | The operation requires auth, and `apitest.config.ts`'s `auth.roles` has more than one role worth distinguishing. |
   | Pagination/filtering | Only if `requiredQueryParams`/`optionalQueryParams` actually include paging/filter params — don't invent a pagination test the API doesn't support. |
   | Data integrity (duplicate creation, referential integrity, concurrency) | POST (create) or PUT (upsert/update) operations; concurrency needs a `custom:` step using `Promise.all` — never fake concurrency with two sequential `operation:` steps. |

3. **Derive concrete payloads from the schema — don't hand-guess:**
   - `required: [...]` → one case per omitted-required-field, or the whole set if short.
   - `type: number` + `minimum`/`maximum` → one case at the boundary (valid) and one just past it
     (invalid); same shape for `exclusiveMinimum`/`exclusiveMaximum` (the boundary value itself
     is invalid there).
   - `enum: [...]` → one case with a value outside the enum.
   - A required `type: string` field → one wrong-type case (send a number/object instead) is
     usually enough to prove the validator rejects non-strings; don't multiply this per field.
   - A free-text string field → one XSS/SQLi payload case, asserting the value round-trips
     verbatim in the response (not corrupted, not a 500) rather than asserting it's "sanitized" —
     don't assume server-side escaping behavior, just check it survives without breaking the
     request.

4. **Confirm auth/role and error-shape behavior live before writing the assertion — never
   guess.** This repo's established convention (see the header comment in
   `scenarios/auth/rbac.cases.yaml` and the cases in
   `scenarios/bookings/booking-flow.scenario.yaml`) is that RBAC/error-message assertions are
   confirmed against the real API first. Use a short live probe, loading the target env file for
   credentials:
   ```
   set -a && source environments/<env>.env && set +a && node -e '...'
   ```
   Log in as each relevant role via `POST /api/auth/login`, hit the operation, record the actual
   status and error body. Only write the case's `assert:` block from what was actually observed —
   copy the exact `error.code`/`error.message` string back rather than paraphrasing it.

5. **Reuse existing custom steps before writing new ones.** Grep `customSteps/*.ts` for a step
   that already does what you need (malformed-JSON-on-the-wire and `Promise.all` concurrency
   races are recurring shapes — see `customSteps/bookingEdgeCases.ts` /
   `customSteps/fleetAssignmentRace.ts` / `customSteps/reliabilitySteps.ts` for examples) before
   writing a new one, and grep for the export name you're about to add either way — duplicate
   export names across `customSteps/*.ts` collide silently (CLAUDE.md's registration rule).

6. **Write the `cases:` block** into the target scenario file — append to an existing
   `.scenario.yaml`/`.cases.yaml` for this resource if one exists (matching
   `booking-flow.scenario.yaml`'s pattern of `steps:` + `cases:` coexisting), otherwise create
   `scenarios/<area>/<topic>.cases.yaml`. Group cases under comment headers by checklist
   category, and add a top-of-file comment listing which categories were deliberately skipped and
   why (mirror `booking-flow.scenario.yaml`'s "Deliberately out of scope" comment) — this stops a
   future edit from re-adding a case for something the API genuinely doesn't support.

7. **Validate and verify — don't hand it back unverified:**
   ```
   npx apitest check
   npx apitest run --tag <tag> --dry-run
   APITEST_ENV=<env> npx playwright test --grep "<scenario name>"
   ```
   Fix any case whose assertion doesn't hold against the live run — check the `jsonpath`
   interpolation pitfall below before assuming the case's *logic* is wrong.

## Pitfalls specific to generated cases

- **`assert.jsonpath` does not interpolate `{{var}}`.** Only `params`/`query`/`headers`/`body`
  and assertion `equals`/`contains`/`oneOf`/`db` `query`/`params` do (see
  `docs/scenario-format.md`). A generated case that needs a dynamic value *inside* the jsonpath
  expression itself (e.g. "no row belongs to someone else") needs a `custom:` step doing the
  comparison in TypeScript, not a declarative filter path — see `assertBookingListIsOwnBookingsOnly`
  in `customSteps/bookingEdgeCases.ts` for the pattern. This exact mistake shipped once in this
  repo and only surfaced on a live run, not `apitest check`.
- A case with no live-confirmed expected value is worse than no case — don't ship a boundary/auth
  case with a guessed status code or error message; either verify it live or leave a
  `# TODO: confirm live` comment and flag it in your summary instead of asserting blind.
- Don't generate a case for a category with nothing to assert (e.g. no free-text string field →
  skip the XSS/SQLi category entirely rather than injecting the payload into a numeric field).

## Token-efficiency notes

- Pull only the one operation's descriptor via the `node -e` one-liner in step 1 — never dump the
  whole `.spec-cache/spec.json` into context.
- Don't re-derive `docs/scenario-format.md`/`docs/custom-steps.md` field syntax from the Zod
  schema/interpreter source if you already have it from earlier in this session.
