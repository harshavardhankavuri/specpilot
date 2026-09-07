---
mode: agent
description: Generate the CRUD/validation/status/auth/data-integrity cases checklist for one operationId against the synced spec, deriving concrete payloads from its schema and confirming role/status behavior live before writing any assertion.
tools: ['codebase', 'search', 'editFiles', 'runCommands']
---

Fast path for the standard test checklist (CRUD, input validation, status codes, auth/RBAC, data
integrity, pagination) applied to one `operationId`, in the style of
`scenarios/bookings/booking-flow.scenario.yaml`'s `cases:` block. Field syntax:
`docs/scenario-format.md`; custom step contract: `docs/custom-steps.md`.

1. **Get the operation.** Ensure `.spec-cache/` is fresh, then:
   ```
   npx apitest describe <operationId>
   ```
   Prints method, params, body constraints (`required`/`minimum`/`maximum`/`exclusiveMinimum`/
   `exclusiveMaximum`/`enum`/`format`), documented response codes. Pass several operationIds in
   one call. A category with no matching documented status/constraint is out of scope.

2. **Scope to what the operation can express** — don't invent a case for a category with no
   shape for it:

   | Category | Applies when |
   |---|---|
   | CRUD | Per HTTP method actually present for this resource. |
   | Missing/wrong-type/boundary/extra field | Body schema has matching constraints. |
   | SQLi/XSS | Any free-text string property in the body. |
   | Status codes | Only codes in `responses`. |
   | Auth (missing/invalid/role) | Requires auth, multiple roles exist worth distinguishing. |
   | Pagination/filtering | Only if paging/filter query params exist. |
   | Data integrity | POST/PUT operations; concurrency needs a `custom:` `Promise.all` step. |

3. **Derive concrete payloads from the schema** — boundary values at and just past
   `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`, one enum-outside-set value, one
   wrong-type value for a required string, one XSS/SQLi payload for a free-text field (assert it
   round-trips, don't assume sanitization).

4. **Confirm auth/role and error-shape behavior live before writing the assertion.** Log in as
   each relevant role, hit the operation, record the actual status/error body — copy the exact
   observed string, don't paraphrase.

5. **Reuse existing custom steps before writing new ones** — grep `customSteps/*.ts` (see
   `bookingEdgeCases.ts`/`fleetAssignmentRace.ts`/`reliabilitySteps.ts` for concurrency/malformed-
   JSON patterns) and check for export-name collisions before adding a new one.

6. **Write the `cases:` block** into the target scenario file, grouped by category, with a
   top-of-file comment listing deliberately-skipped categories and why.

7. **Validate and verify:**
   ```
   npx apitest check
   npx apitest run --tag <tag> --dry-run
   APITEST_ENV=<env> npx playwright test --grep "<scenario name>"
   ```

Pitfalls: `assert.jsonpath` does not interpolate `{{var}}` — a dynamic value inside the jsonpath
expression itself needs a `custom:` step instead. A case with a guessed (not live-confirmed)
expected value is worse than no case — leave a `# TODO: confirm live` comment instead of
asserting blind.
