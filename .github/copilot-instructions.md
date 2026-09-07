# SpecPilot (@assertquest/specpilot) — Copilot instructions

Contract-first API test framework on Playwright. The OpenAPI spec is the source of truth —
scenarios reference operations by `operationId`, never hand-typed URLs.

This repo root is the framework itself (`src/`, `bin/`, `runtime/scenario.spec.ts`, `docs/`) — it
has no `scenarios/`/`customSteps/`/`queries/`/`apitest.config.ts` of its own. That content lives
in `examples/assertquest/`, a worked example project consuming this framework as a dependency.
Every mention below of `scenarios/`, `customSteps/`, `queries/`, or running `apitest` commands
describes any apitest project's layout generically — in this repo, those paths and commands live
inside `examples/assertquest/`, not at repo root.

This file mirrors `CLAUDE.md` (Claude Code's project instructions). If the two disagree,
`CLAUDE.md` is authoritative.

## Source of truth, not this file

- Scenario field reference: `docs/scenario-format.md` (generated from `src/schema/scenarioSchema.ts`
  — if they disagree, the schema wins).
- Custom step contract: `docs/custom-steps.md` (generated from `src/interpreter/customStepRegistry.ts`
  and `src/types/customStep.ts`).
- Read the doc first; only fall through to source if the doc looks stale.

## Generated files — never hand-edit

- `schemas/scenario.schema.json` — regenerate with `npx apitest schema`.
- `.spec-cache/` — written by `npx apitest sync` (or `apitest drift --sync`).
- `runtime/scenario.spec.ts` — interprets scenario data generically; never generated or hand-edited
  per API.
- `allure-report/`, `test-results/`, `playwright-report/` — run output, not source.

## Workflow order

1. `npx apitest sync` — required before `run`/`check`.
2. `npx apitest check` — validates every `operationId`/param, no requests sent.
3. Author/edit `scenarios/*.scenario.yaml` / `*.cases.yaml`.
4. `npx apitest run [--env] [--tag] [--dry-run]`, then optionally `npx apitest digest`.
5. Optionally `npx apitest add-assertions <file> [--env] [--dry-run]` — mutates the file in place,
   always show the diff before/after.

`apitest check` does **not** verify a `custom:` name resolves to a real export — only a run does.
`npx apitest describe <operationId> [...]` prints one operation's shape without dumping the whole
synced spec.

## customSteps/ registration rule

Every function-valued named export directly under `customSteps/*.ts` (not recursive) is
auto-registered under its own export name. Duplicate export names collide silently (last-loaded
wins) — grep before adding a new one.

## queries/ — the named SQL query library

Reusable, typed, parameterized query functions against `db.connections`, one file per table.
`customSteps/*.ts` should call these instead of hand-writing SQL. Nothing here auto-registers.
Not used by declarative `assert: - db:` (that field's `query:` is always inline SQL).

## Scope hygiene

- `examples/petstore/` and `examples/assertquest/` are sample content, not framework source —
  exclude from routine search unless the task is explicitly about an example.
- `node_modules/`, `allure-report/`, `test-results/`, `playwright-report/` are never worth reading.
- No compiled `dist/` — the CLI runs TypeScript directly via `tsx`.

## Reusable prompts and chat modes

- `.github/prompts/*.prompt.md` — reusable task prompts (`add-scenario`, `add-custom-step`,
  `checklist-cases`, `sync-and-check`). Invoke with `/<name>` in Copilot Chat.
- `.github/chatmodes/*.chatmode.md` — specialized chat modes with restricted tools
  (`coverage-auditor` read-only audit, `test-fixer`, `project-bootstrapper`). Switch to one via
  the chat mode picker. `project-bootstrapper` is destructive (wipes an example project's
  scenarios/config) — only use it with an explicit target directory and new spec in mind, never
  as a default mode.
