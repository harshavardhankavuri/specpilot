# SpecPilot (apitest-framework) — agent instructions

Contract-first API test framework on Playwright. The OpenAPI spec is the source of truth —
scenarios reference operations by `operationId`, never hand-typed URLs.

This repo root is the framework itself (`src/`, `bin/`, `runtime/scenario.spec.ts`, `docs/`) — it
has no `scenarios/`/`customSteps/`/`queries/`/`apitest.config.ts` of its own. That content lives
in `examples/assertquest/`, a worked example project consuming this framework as a dependency.
Every section below that talks about `scenarios/`, `customSteps/`, `queries/`, or running
`apitest` commands describes any apitest project's layout generically — in this repo, run those
commands and find those paths inside `examples/assertquest/`, not at repo root.

This file mirrors `CLAUDE.md` (Claude Code's project instructions). If the two ever disagree,
`CLAUDE.md` is authoritative — update this file to match rather than the other way around.

## Source of truth, not this file

- Scenario field reference: `docs/scenario-format.md` (generated from `src/schema/scenarioSchema.ts`
  — if they disagree, the schema wins).
- Custom step contract: `docs/custom-steps.md` (generated from `src/interpreter/customStepRegistry.ts`
  and `src/types/customStep.ts`).
- Don't re-derive either doc's content from source scratch — read the doc first, and only fall
  through to source if the doc seems stale.

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
4. `npx apitest run [--env] [--tag] [--dry-run]`, then optionally `npx apitest digest` to summarize
   `allure-results/` into new/persistent/newly-fixed failures.
5. Optionally, `npx apitest add-assertions <file> [--env] [--dry-run]` — runs one file live and
   appends `assert:` entries generated from its actual responses. Mutates the file in place —
   always show the diff (or run `--dry-run` first), and re-run `check`/`run` afterward.

`apitest check` does **not** verify a `custom:` name resolves to a real export — only a run does.
Grep `customSteps/*.ts` for the export name yourself before trusting a `custom:` reference.

`npx apitest describe <operationId> [<operationId> ...]` prints one operation's method/params/
body constraints/documented responses without dumping the whole synced spec.

## customSteps/ registration rule

Every function-valued named export directly under `customSteps/*.ts` (not recursive) is
auto-registered under its own export name. Two files exporting the same name → last-loaded wins
silently. Before adding a new export name, grep `customSteps/*.ts` for it to avoid a collision.

## queries/ — the named SQL query library

Reusable, typed, parameterized query functions against `db.connections` — one file per table.
`customSteps/*.ts` should call these instead of hand-writing SQL inline. Nothing here
auto-registers — normal functions taking a `DbAdapter` as their first argument, imported
explicitly. Not used by declarative `assert: - db:` in scenario YAML (that field's `query:` is
always inline SQL by design).

## Scope hygiene

- `examples/petstore/` (spec-only sample) and `examples/assertquest/` (the full worked example,
  against the SwiftCargo API) are sample content, not this framework's own source — exclude both
  from routine search unless the task is explicitly about an example itself.
- `node_modules/`, `allure-report/`, `test-results/`, `playwright-report/` are never worth reading.
- There is no compiled `dist/` — the CLI runs TypeScript directly via `tsx`.

## Reusable task prompts

This repo defines Codex CLI custom prompts under `.codex/prompts/` — one per recurring task
(`add-scenario`, `add-custom-step`, `checklist-cases`, `sync-and-check`, `coverage-auditor`,
`test-fixer`, `project-bootstrapper`). If your Codex CLI build reads project-local prompts, invoke
them with `/<name>`; otherwise copy the relevant file into `~/.codex/prompts/` or open it and
follow its steps directly. Each file documents what it does, when to use it, and what it must
never do (in particular: `project-bootstrapper` is destructive — never run it without an explicit
target directory and new spec confirmed by the human operator).
