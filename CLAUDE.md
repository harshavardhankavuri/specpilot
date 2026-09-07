# SpecPilot (@assertquest/specpilot)

Contract-first API test framework on Playwright. The OpenAPI spec is the source of
truth — scenarios reference operations by `operationId`, never hand-typed URLs.

This repo root is the framework itself (`src/`, `bin/`, `runtime/scenario.spec.ts`, `docs/`) —
it has no `scenarios/`/`customSteps/`/`queries/`/`apitest.config.ts` of its own. That content
lives in `examples/assertquest/`, a worked example project consuming this framework as a
dependency. Every section below that talks about `scenarios/`, `customSteps/`, `queries/`, or
running `apitest` commands describes any apitest project's layout generically — in this repo,
run those commands and find those paths inside `examples/assertquest/`, not at repo root.

## Source of truth, not this file

- Scenario field reference: `docs/scenario-format.md` (generated from `src/schema/scenarioSchema.ts`
  — if they disagree, the schema wins).
- Custom step contract: `docs/custom-steps.md` (generated from `src/interpreter/customStepRegistry.ts`
  and `src/types/customStep.ts`).
- Skill/agent usage — what each does, when to use it, invocation syntax, credential/live-API
  footprint: `docs/ai-tooling.md`.
- Don't re-derive any of these docs' content from source scratch — read the doc first, and only
  fall through to source if the doc seems stale.

## Generated files — never hand-edit

- `schemas/scenario.schema.json` — regenerate with `npx apitest schema`, source is
  `src/schema/scenarioSchema.ts`.
- `.spec-cache/` — written by `npx apitest sync` (or `apitest drift --sync`). Treat as the current
  synced spec; don't re-fetch the OpenAPI doc over the network if this is already present and fresh.
- `runtime/scenario.spec.ts` — the one checked-in Playwright spec file. It interprets scenario
  data generically; it is never generated per-API and never hand-edited to add a new scenario.
- `allure-report/`, `test-results/`, `playwright-report/` — run output, not source.

## Workflow order

0. Optional, before re-syncing over an existing cache: `npx apitest drift` diffs the live spec
   against `.spec-cache/` and reports breaking vs. informational changes (plus which scenario
   files reference each affected operation) without touching the cache. `--sync` accepts the live
   spec afterward, equivalent to running `sync`.
1. `npx apitest sync` — required before `run`/`check` (Playwright collects tests synchronously).
2. `npx apitest check` — validates every `operationId`/param against the synced spec, no requests sent.
3. Author/edit `scenarios/*.scenario.yaml` / `*.cases.yaml`.
4. `npx apitest run [--env] [--tag] [--dry-run]`.
   - Afterward, `npx apitest digest` summarizes `allure-results/` into new/persistent/newly-fixed
     failures — local-only, reads no network/credentials, isolates the latest run by clustering
     result-file write times (`allure-results/.digest-history.json` holds the comparison state).
5. Optionally, `npx apitest add-assertions <file> [--env] [--dry-run]` — runs one file live and
   appends `assert:` entries generated from its actual responses (only for `operation:` steps;
   never touches a jsonpath the author already asserted on). This mutates the scenario file in
   place — always show the user the diff (or run with `--dry-run` first) rather than writing
   silently, and re-run `check`/`run` afterward to confirm the generated assertions pass.

`apitest check` does **not** verify a `custom:` name resolves to a real export — only a run does.
Grep `customSteps/*.ts` for the export name yourself before trusting a `custom:` reference.

Need one operation's shape (method/params/body constraints/documented responses) without grepping
`.spec-cache/spec.json` by hand? `npx apitest describe <operationId> [<operationId> ...]`.

## customSteps/ registration rule

Every function-valued named export directly under `customSteps/*.ts` (not recursive) is
auto-registered under its own export name. Two files exporting the same name → last-loaded wins
silently. Before adding a new export name, grep `customSteps/*.ts` for it to avoid a collision.

## `queries/` — the named SQL query library

Reusable, typed, parameterized query functions against `db.connections` — one file per table
(`queries/shipments.ts`, `queries/assignments.ts`, ...), re-exported from `queries/index.ts`.
`customSteps/*.ts` should call these (`import { getShipmentById } from "../queries/index.js"`)
instead of hand-writing SQL inline, the way `customSteps/dbE2eSteps.ts` does. Unlike
`customSteps/`, nothing here auto-registers — these are just normal functions taking a
`DbAdapter` as their first argument, imported explicitly where needed. Not used by declarative
`assert: - db:` in scenario YAML — that field's `query:` is always inline SQL by design; this
library is for `custom:` steps and ad-hoc scripts. Row-shape interfaces here are hand-maintained
subsets of each table's columns (just what each query selects), not generated — they intentionally
don't import from `src/db/types/*.d.ts` (gitignored, only exists after `apitest db:introspect`),
so this library works in a fresh checkout with no setup.

## Scope hygiene (keep unrelated bulk out of context)

- `examples/petstore/` (spec-only CLI-trying sample) and `examples/assertquest/` (the full worked
  example project, against the SwiftCargo API) are sample content, not this framework's own
  source — exclude both from routine Grep/Glob unless the task is explicitly about an example
  itself.
- `node_modules/`, `allure-report/`, `test-results/`, `playwright-report/` are never worth reading.
- There is no compiled `dist/` in this build — the CLI runs TypeScript directly via `tsx`
  (`bin/*.js`). Don't go looking for build output.

## Available project skills and agents

Full usage doc (what each does, when to use it vs. the alternatives, invocation syntax, whether it
touches credentials/the live API): `docs/ai-tooling.md` — read that instead of guessing from a
name alone, especially before choosing between `/checklist-cases` (generates) and
`coverage-auditor` (only lists gaps, read-only).

Skills (run inline, in the current conversation — invoke with `/<name>` or the Skill tool):
`/add-scenario`, `/add-custom-step`, `/sync-and-check`, `/checklist-cases`.

Agents (spawned via the Agent tool with a fresh context and a hard tool allowlist — unlike a
skill, they genuinely cannot use a tool outside their frontmatter's `tools:` list; independent
invocations should be launched in parallel as separate background agents, not one agent working a
list sequentially): `test-fixer`, `coverage-auditor`, `project-bootstrapper`.

These skills/agents are Claude Code-specific (`.claude/skills/`, `.claude/agents/`). Equivalent
instructions are also checked in for other AI coding tools — `AGENTS.md` + `.codex/prompts/` for
OpenAI Codex CLI, `.github/copilot-instructions.md` + `.github/prompts/` + `.github/chatmodes/`
for GitHub Copilot — kept in sync with the Claude Code originals; see `docs/ai-tooling.md`'s
"Cross-tool ports" section for the mapping.
