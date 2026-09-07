# Scenario file format reference

This documents every field accepted by `*.scenario.yaml` and `*.cases.yaml` files, generated
by reading straight from the source of truth: `src/schema/scenarioSchema.ts` (the Zod schema
that validates every scenario file at load time — see `src/interpreter/discoverScenarios.ts`)
and `src/types/scenario.ts` (the matching TypeScript types). If this doc and the schema ever
disagree, the schema wins — regenerate the IntelliSense JSON Schema with `apitest schema` and
re-check this file.

For the `custom:` step field and the `cleanup:` scenario field — how to write and register a
custom step, what it receives, and what it's for — see `docs/custom-steps.md`.

Both file types are parsed identically; the `.scenario.yaml` vs `.cases.yaml` suffix is a
naming convention only, not something the loader enforces. `discoverScenarios()` walks
`scenarios/**/*.scenario.yaml` and `scenarios/**/*.cases.yaml` and validates every file
against the same schema.

---

## Top-level fields (scenario file)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Shown as the `test.describe` title and (for a `steps:` file) the test title. |
| `tags` | string[] | no | Prefixed with `@` and attached to every test the file produces — filter with `apitest run --tag <tag>` or `npx playwright test --grep "@tag"`. |
| `auth` | string | no | Default auth role (a key under `apitest.config.ts`'s `auth.roles`) applied to every step that doesn't set its own `auth:`. Omit for no default auth. |
| `db` | object | no | See [DB hooks](#db-hooks-schema-accepted-not-yet-wired-up) — **currently accepted by the schema but not actually wired up in the interpreter.** |
| `steps` | Step[] (min 1) | one of `steps`/`cases` required | A single chained flow — produces exactly **one** Playwright test. |
| `cases` | Case[] (min 1) | one of `steps`/`cases` required | Independent test cases — each produces its **own** Playwright test. A file may define both `steps` and `cases` together if you want a chained flow and a batch of edge cases sharing the same `name`/`auth`/`tags`/`cleanup`. |
| `cleanup` | string | no | Name of a `customSteps/*.ts` export that always runs after the steps/case finish — pass or fail, like a `finally` block. Applies to the `steps:` flow and to every entry in `cases:` in this file. |

---

## Step object (used in both `steps:` and each case's `steps:`)

Exactly one of `operation` or `custom` is required — never both, never neither.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | Shown as the `test.step` title. Falls back to `operation`, then `custom`, then `"step"`. |
| `operation` | string | one of `operation`/`custom` | An `operationId` from the synced OpenAPI spec (`.spec-cache/spec.json`, written by `apitest sync`). `apitest check` verifies this actually exists. |
| `custom` | string | one of `operation`/`custom` | The export name of a `customSteps/*.ts` function — the escape hatch for anything beyond a declarative HTTP call (setup, data transformation, cleanup, multi-call logic). Receives `(ctx: StepContext)` with `request`, `roleRequest`, `spec`, `db`, `vars`, `defaultAuth`. |
| `auth` | string | no | Overrides the scenario/case-level default for this step only. Use the literal string `"none"` to send the request with no auth at all. |
| `params` | object | no | Fills the operation's path params (e.g. `{id}` in `/api/booking/{id}`). Values may use `{{var}}` interpolation. |
| `query` | object | no | Query string params. Required query params (per the spec) must be present unless the value itself is unresolved (contains `{{`). Values may use `{{var}}`. |
| `headers` | object | no | Extra headers for this request, merged over (and able to override) whatever the resolved `auth` role sets — see the [bogus-token example](#example-overriding-auth-with-a-per-step-header) below. Values may use `{{var}}`. |
| `body` | any | no | Request body — interpolated deeply, so `{{var}}` works at any nesting depth, in any position. Ignored for methods that don't take a body. |
| `extract` | `{ [varName]: jsonpath }` | no | Pulls values out of the response body into scenario `vars`, available to every later step (and the `cleanup` step) as `{{varName}}`. A jsonpath that doesn't match yields `undefined`, which later resolves to an "unresolved placeholder" error rather than a silent `undefined`. **Not available to this same step's own `assert:`** — a step's `assert:` runs before its `extract:` (see `runStep.ts`), so a var this step extracts can only be referenced starting the *next* step. |
| `assert` | Assertion[] | no | Extra checks beyond the automatic status/schema check every step gets for free (see below). |

Every step, regardless of `assert:`, automatically gets:
1. **Status is documented** — the response's HTTP status must be one of the operation's documented response codes in the spec.
2. **Schema match** — if that status has an `application/json` schema declared in the spec, the response body must validate against it. (Non-JSON responses, e.g. PDFs/CSVs, have no schema to check — this step is silently skipped for them; use raw-body assertions instead, below.)

---

## Assertion object (`assert:` entries)

An assertion is normally written with exactly one **source** (`status`, `header`, `jsonpath`,
the raw-body fields, or `db`) and, for `header`/`jsonpath`, one or more **operators**. Unlike the
step-level `operation`/`custom` split, the schema does **not** enforce this exclusivity — nothing
stops a YAML author from combining, say, `status` and `jsonpath` in one entry, and each present
source is checked independently at runtime (see `runAssertion.ts`). Stick to one source per entry
by convention; split combined checks into separate `assert:` list entries instead. Multiple
assertions in one `assert:` list are all checked independently.

### Source: `status`

| Field | Type | Meaning |
|---|---|---|
| `status` | number | Exact HTTP status code the response must have. |

```yaml
- status: 201
```

### Source: `header`

| Field | Type | Meaning |
|---|---|---|
| `header` | string | Response header name (case-insensitive). |

Takes any of the **operators** below, applied to the header's string value.

```yaml
- header: content-type
  contains: "json"
```

### Source: `jsonpath`

| Field | Type | Meaning |
|---|---|---|
| `jsonpath` | string | A [JSONPath](https://github.com/JSONPath-Plus/JSONPath) expression evaluated against the parsed JSON response body. |

Takes any of the **operators** below, applied to the extracted value.

```yaml
- jsonpath: $.shipment.status
  oneOf: ["booked", "in_transit", "delivered", "cancelled"]
```

### Operators (shared by `header` and `jsonpath`)

| Field | Type | Checks |
|---|---|---|
| `equals` | any | Deep-equals the given value. Interpolated (`{{var}}` allowed). |
| `contains` | any | **Array values:** the array contains an element deep-equal to this. **String values:** substring containment (`String(value).includes(...)`). Interpolated. |
| `exists` | boolean | `true` → value is not `undefined`. `false` → value is `undefined` (e.g. path didn't match, or field is absent). |
| `matches` | string (regex) | `String(value)` matches this regular expression (via `new RegExp(pattern).test(...)`). |
| `oneOf` | any[] | Value deep-equals at least one entry in the list. Interpolated. |
| `minLength` | number | `value.length >= n` — only meaningful for a string or array value; anything else is treated as length `undefined` and fails. |
| `maxLength` | number | `value.length <= n` — same caveat as `minLength`. |
| `greaterThan` | number | `value > n` — value must actually be a number. |
| `lessThan` | number | `value < n` | |
| `greaterThanOrEqual` | number | `value >= n` | |
| `lessThanOrEqual` | number | `value <= n` | |

Any combination of operators may appear on the same assertion entry (e.g. `minLength` +
`maxLength` together); each becomes its own reported check.

### Raw-body checks (non-JSON responses — PDFs, CSV exports, etc.)

These read the actual response bytes, not a parsed JSON body — use them where the automatic
schema check can't apply because the response isn't JSON.

| Field | Type | Checks |
|---|---|---|
| `bodyStartsWith` | string | The response body's bytes start with this string, compared byte-for-byte (decoded as `latin1`, so arbitrary byte values — not just ASCII — round-trip losslessly). Useful for magic-byte / file-signature checks (`"%PDF-"`, etc.). |
| `bodyMinBytes` | number | Response body is at least this many bytes. |
| `bodyMaxBytes` | number | Response body is at most this many bytes. |

```yaml
- bodyStartsWith: "%PDF-"
- bodyMinBytes: 1024
- bodyMaxBytes: 5000000
```

### Source: `db`

Requires a connection declared in `apitest.config.ts`'s `db.connections`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `db` | string | yes | Connection name from `apitest.config.ts`. |
| `query` | string | yes | SQL using `?` placeholders (translated automatically to the connection's dialect — `$1, $2, ...` for Postgres, `@p1, @p2, ...` for SQL Server). Interpolated as a whole string before running. |
| `params` | any[] | no | Bound values for the `?` placeholders, in order. Each interpolated. |
| `expectRow` | `{ [column]: value }` | no | Deep-equals each named column against the **first** returned row. Columns not listed are ignored. Fails automatically if the query returns zero rows. |

```yaml
- db: primary
  query: "SELECT status FROM shipments WHERE id = ?"
  params: ["{{shipmentId}}"]
  expectRow:
    status: "pending"
```

---

## Case object (`cases:` entries)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | The individual Playwright test's title. |
| `steps` | Step[] (min 1) | yes | Same step object as above. Runs as its own independent test — vars, auth resolution, and `cleanup` (if the file sets one) are all scoped to this one case, not shared with other cases in the same file. |

---

## `db:` hooks schema (accepted, not yet wired up)

```yaml
db:
  connection: primary
  seed: seeds/booking-flow.sql
  rollback: true
```

The schema validates this shape (`connection`, `seed`, `rollback: boolean`), but **nothing in
the interpreter currently reads it** — it's a documented, planned feature (transactional
seed-then-rollback per scenario) that hasn't been implemented. If you write this today, it will
pass `apitest check` and then silently do nothing. Use a `custom:` setup step + the `cleanup:`
hook (both fully working, see above) for the same effect in the meantime.

---

## Interpolation (`{{var}}`)

Any string value in `params`, `query`, `headers`, `body`, assertion `equals`/`contains`/`oneOf`,
and db `query`/`params` may reference:
- A scenario variable — written by an earlier step's `extract:`, or by a `custom:` step writing
  to `ctx.vars`.
- An environment variable — if no matching scenario var exists, `{{NAME}}` falls back to
  `process.env.NAME`.

If a placeholder resolves to `undefined` (unset env var, or a var that was never
extract/written, or an `extract:` jsonpath that didn't match anything), the step throws
`Unresolved placeholder "{{NAME}}"` rather than silently sending the literal string. The one
exception is `apitest run --dry-run`, which — since it never actually executes earlier
steps — prints the unresolved template with a note instead of failing, so you can still preview
the whole plan.

A whole-string placeholder (`"{{id}}"`, nothing else in the string) preserves the original
value's type (number, object, etc.); an embedded placeholder (`"prefix-{{id}}"`) always
produces a string.

---

## Full example — everything in one file

```yaml
# yaml-language-server: $schema=../schemas/scenario.schema.json
name: booking-flow
tags: [booking, smoke]
auth: swiftCargoBearer
cleanup: advanceTestShipment
steps:
  - custom: generateBookingLabels

  - name: create booking
    operation: post_api-booking
    body:
      origin:
        label: "{{pickupLabel}}"
        lat: 40.7128
        lng: -74.0060
      destination:
        label: "{{dropoffLabel}}"
        lat: 34.0522
        lng: -118.2437
      package:
        weightKg: 12.5
        lengthCm: 40
        widthCm: 30
        heightCm: 20
    extract:
      shipmentId: $.shipment.id
    assert:
      - status: 201
      - header: content-type
        contains: "json"
      - jsonpath: $.shipment.status
        equals: "booked"
      - jsonpath: $.shipment.id
        minLength: 1

  - custom: normalizeShipmentId

  - name: fetch booking by id
    operation: get_api-booking-id
    params:
      id: "{{shipmentId}}"
    assert:
      - jsonpath: $.shipment.id
        equals: "{{shipmentId}}"
```

### Example: independent cases in one file

```yaml
# yaml-language-server: $schema=../schemas/scenario.schema.json
name: auth-me-permissions
tags: [auth]
auth: swiftCargoBearer
cases:
  - name: no auth token -> 401
    steps:
      - operation: get_api-auth-me
        auth: none
        assert:
          - status: 401

  - name: valid auth -> 200 with the logged-in user's role
    steps:
      - operation: get_api-auth-me
        assert:
          - status: 200
          - jsonpath: $.user.role
            oneOf: ["admin", "dispatcher", "driver", "customer"]
```

### Example: overriding auth with a per-step header

A step's `headers:` are merged over whatever the resolved `auth:` role sets, so you can
deliberately break auth for a negative test without switching the whole scenario to `auth: none`:

```yaml
  - name: bogus bearer token -> 401
    steps:
      - operation: get_api-auth-me
        headers:
          Authorization: "Bearer not-a-real-token"
        assert:
          - status: 401
```
