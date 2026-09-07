# AI tooling: skills and agents

This repo has two kinds of Claude Code extension checked in under `.claude/`: **skills**
(`.claude/skills/*/SKILL.md`) and **agents** (`.claude/agents/*.md`). They are not the same
mechanism and aren't interchangeable — this doc says what each one is, exactly how to invoke it,
and when to reach for it over the alternatives (including "just do it inline, no tooling needed").

## Skills vs. agents — the mechanical difference

| | Skill | Agent |
|---|---|---|
| **Runs where** | Inline, in the current conversation — Claude loads the instructions and executes them itself, same context, same turn. | A separate spawned worker with its own fresh context window. It never sees the calling conversation unless that context is put in the prompt. |
| **Tool access** | Advisory only. The skill file can say "don't edit files," but Claude still has every tool it normally has in that session. | Enforced by the harness via the `tools:` frontmatter — a genuine allowlist. `coverage-auditor` cannot call Edit/Write even if instructed to; the tool call is refused, not just discouraged. |
| **Invoke with** | `/<name>` or the Skill tool, with optional `args`. | The Agent tool with `subagent_type: <name>`, plus a self-contained `prompt` (the agent has no memory of this conversation). |
| **Availability after creation/edit** | Picked up mid-session in this environment — no restart needed. | Requires a fresh session (or restart) before a newly added/renamed agent type appears in the Agent tool's list. |
| **Execution model** | Synchronous, part of the current turn. | Foreground or background (`run_in_background`); background is the default and lets the user keep working while it runs. |

Rule of thumb: reach for a **skill** when the task is a *procedure* worth following consistently,
especially one that benefits from the ongoing conversation's context. Reach for an **agent** when
the task is a *self-contained unit of work* worth isolating — either because a hard tool
boundary matters (an audit that must never write), or because keeping a large exploration out of
the main context window matters.

Neither is required for a one-off task that doesn't match any of the ones below — for anything
else, just do it directly with the normal tools.

---

## Skills

### `/add-scenario`

**What it does**: scaffolds a new `*.scenario.yaml`/`*.cases.yaml` file against a given
`operationId` from the synced spec — picks `steps:` vs. `cases:`, writes the schema pragma,
reminds about the common field pitfalls (exactly one of `operation`/`custom`, `auth: "none"` vs.
omitting `auth:`, etc.).

**Use when**: starting a brand-new scenario file from scratch and you already know (or the user
already knows) which `operationId`(s) it should cover.

**Don't use when**: you're adding cases to a file that already exists — just edit it directly, or
use `/checklist-cases` if you want the full checklist generated rather than one case at a time.

**Invoke**: `/add-scenario` (with the target `operationId`/topic in the prompt), or
`Skill({ skill: "add-scenario", args: "..." })`.

---

### `/add-custom-step`

**What it does**: adds a typed `CustomStep` export to `customSteps/*.ts` for logic a declarative
`operation:` step can't express (setup, transforming an extracted value, multi-call/concurrency
logic, guaranteed cleanup) — checked against the registration rule (every function-valued named
export directly under `customSteps/*.ts` auto-registers under its own name; duplicates collide
silently).

**Use when**: a scenario needs something outside plain request/assert — e.g. `Promise.all`
concurrency, a raw non-JSON request body, multi-step setup that writes to `ctx.vars`.

**Don't use when**: the step can be expressed as a normal `operation:` + `assert:` — reach for
this only once you've confirmed the declarative form can't do it (see
`docs/scenario-format.md`/`docs/custom-steps.md` first).

**Invoke**: `/add-custom-step`, or `Skill({ skill: "add-custom-step", args: "..." })`.

---

### `/sync-and-check`

**What it does**: runs `npx apitest sync` + `npx apitest check` and triages any failures from the
CLI output alone (unknown `operationId`, missing/extra required param) — without dumping the
whole synced spec or every scenario file into context to cross-check by hand.

**Use when**: you need to confirm scenarios still line up with the spec — before a run, after
editing scenario files, or after the API changes. Skips `sync` automatically if `.spec-cache/` is
already fresh this session.

**Don't use when**: you specifically want to see what changed in the spec, not just whether
current scenarios still validate — that's `apitest drift` (a CLI command, not a skill; see below).

**Invoke**: `/sync-and-check`.

---

### `/checklist-cases`

**What it does**: generates the CRUD / input-validation / status / auth-RBAC / data-integrity
`cases:` checklist for one `operationId`. Pulls the operation's schema via
`npx apitest describe`, derives concrete boundary/negative payloads from its constraints (required
fields, min/max, enum), reuses existing `customSteps/*.ts` where the category needs one
(concurrency, malformed JSON), and — critically — **confirms role/error-message behavior against
the live API before writing any assertion**, rather than guessing. Writes the `cases:` block into
the target scenario file and validates + runs it before handing back.

**Use when**: you want full checklist coverage for an operation the way `booking-flow.scenario.yaml`
and `fleet-assignments.cases.yaml` were built in this repo — not just a happy-path case.

**Don't use when**: you only want to *know* what's missing without generating anything yet — use
the `coverage-auditor` agent for that (read-only, no live calls, no file writes). Run the auditor
first if you're not sure the file needs any of this yet.

**Needs live API access**: yes — it logs in as configured `auth.roles` and sends real requests
against `environments/<env>.env`'s `BASE_URL` to confirm behavior. Don't invoke it against an
environment you don't want test data written to.

**Invoke**: `/checklist-cases` with the target `operationId` (and optionally the target file, env)
in the prompt.

---

## Agents

### `test-fixer`

**What it does**: given a failing/broken scenario, reproduces it with the minimum surface
(`apitest check` first, then a scoped `--grep`/`--tag` run, never the whole suite), classifies the
failure, and fixes it **only if it's a test-authoring bug** — a stale expected value, the
`assert.jsonpath` non-interpolation gotcha, a typo'd `operationId`/`custom:` name, or a bug in a
`custom:` step's own logic. It explicitly does **not** loosen an assertion to paper over a real
API defect, an environment/routing issue, or an intentionally-red test (e.g. "rate limiting should
trigger but doesn't") — those get reported with evidence instead.

**Use when**: `apitest run`/`apitest check`/a Playwright report shows a red test and you want it
triaged (and fixed, if it's actually a test bug) without doing the reproduce-classify-fix cycle by
hand.

**Don't use when**: you already know the failure is a genuine API/environment issue with nothing
to fix in the test — there's nothing for it to do beyond confirm what you already know. Also skip
it for a failure you want to *stay* red on purpose (already-classified intentional gaps) unless
you want it to double-check that classification.

**Multiple failures**: launch one `test-fixer` per unrelated failure as parallel background
agents, not one agent working through a list — they're independent triage tasks.

**Tools**: Read, Edit, Write, Grep, Glob, Bash (it can and does modify scenario/`customSteps/*.ts`
files). **Needs live API access**: yes, to reproduce failures and verify fixes.

**Invoke**: `Agent({ subagent_type: "test-fixer", prompt: "<which failure(s), which env>" })`.

---

### `coverage-auditor`

**What it does**: given one scenario/cases file, reads every `operationId` it references, pulls
each one's shape via `npx apitest describe`, works out which checklist categories are actually
*applicable* (no fake pagination gap on an endpoint with no query params), then classifies what
the file's existing cases actually assert (not just their titles) into Covered / Missing /
Good-to-have. Also flags fake coverage — e.g. a "concurrency" case that's really two sequential
steps, or a `jsonpath:` assertion built from an unresolved `{{var}}`.

**Use when**: you want to know what's missing from an existing file before generating anything —
"what's missing from `booking-flow.scenario.yaml`?", "review coverage for this file", or as a
sanity check before/after running `/checklist-cases`.

**Don't use when**: you want the gaps actually filled, not just listed — that's `/checklist-cases`
(this agent is deliberately read-only and won't do it).

**Multiple files**: launch one `coverage-auditor` per file as parallel background agents rather
than auditing a whole directory in one call.

**Tools**: Read, Grep, Glob, Bash — **no** Edit/Write, enforced by the harness, not just by
instruction. **Needs live API access**: no — pure static analysis against the synced spec cache;
never calls the live API.

**Model**: pinned to `haiku` (pure classification against a schema, no code-writing) — cheaper and
faster than the session default by design.

**Invoke**: `Agent({ subagent_type: "coverage-auditor", prompt: "<path to the scenario/cases file>" })`.

---

### `project-bootstrapper`

**What it does**: resets an existing apitest project directory back to a clean slate and points
it at a *different* target API. Confirms the target is a real apitest project, deletes only the
regenerable/API-specific pieces (`scenarios/`, `customSteps/`, `queries/`, `seeds/`,
`.spec-cache/`, run artifacts — never `node_modules/`, `package.json`, `playwright.config.ts`, or
a live `environments/*.env`), runs `apitest init --spec <new spec>`, regenerates
`environments/dev.env.example`, syncs and validates against the new spec, then writes and
validates one minimal `scenarios/smoke.scenario.yaml` against a safe (preferably unauthenticated
GET) operation so the project is immediately runnable.

**Use when**: the user explicitly asks to repoint `examples/assertquest` (or another apitest
project) at a different OpenAPI spec, or to reset one back to a blank starting point.

**Don't use when**: you just want to add a scenario to the *existing* target API — that's
`/add-scenario`. Never invoke this proactively or infer the target/spec yourself — it deletes
existing scenario/customStep/query files, so both the target directory and the new spec must be
explicit.

**Destructive**: yes. It scopes every delete to named subpaths (never a bare recursive delete of
the whole target) and lists what it's about to remove before removing it, but it is still
irreversible in this non-git repo — confirm with the user before invoking it.

**Tools**: Read, Write, Edit, Glob, Grep, Bash. **Needs live API access**: only for `apitest sync`/
`apitest check` against the new spec's metadata — it never fills in or guesses real credentials,
and won't run the new smoke scenario unless credentials are already confirmed present.

**Invoke**: `Agent({ subagent_type: "project-bootstrapper", prompt: "<target directory> <new spec URL or path>" })`.

---

## Related CLI commands (not skills or agents, but built alongside them)

These are plain `apitest` subcommands — always available, no invocation ceremony, and the thing
the skills/agents above call internally rather than re-deriving:

- `npx apitest describe <operationId> [<operationId> ...]` — compact method/params/body-
  constraints/response-codes summary for one or more operations, instead of grepping
  `.spec-cache/spec.json` by hand.
- `npx apitest drift [--sync]` — diffs the live spec against `.spec-cache/`, reports breaking vs.
  informational changes plus which scenario files reference each affected operation. Local
  unauthenticated spec fetch only — no credentials.
- `npx apitest digest [--dir <path>]` — summarizes the most recent `allure-results/` run into
  new/persistent/newly-fixed failures. Local file reads only — no network calls, no credentials.

## Credential/network summary

| | Reads `environments/*.env`? | Calls the live API? |
|---|---|---|
| `/add-scenario`, `/add-custom-step`, `/sync-and-check` | No | `sync-and-check` fetches the public spec doc only |
| `/checklist-cases` | Yes | Yes — logs in as configured roles to confirm behavior |
| `test-fixer` | Yes | Yes — reproduces and verifies fixes live |
| `coverage-auditor` | No | No — static analysis only |
| `project-bootstrapper` | Only regenerates `.env.example`, never reads/writes real credentials | `apitest sync`/`apitest init` only (unauthenticated spec fetch) |
| `apitest drift` | No | Unauthenticated spec fetch only |
| `apitest digest` | No | No — local file reads only |

## Cross-tool ports

The skills/agents above are Claude Code's native mechanism (`.claude/skills/*/SKILL.md`,
`.claude/agents/*.md`). This repo also checks in equivalent instructions for two other AI coding
tools, kept behaviorally in sync with the Claude Code originals (same steps, same guardrails —
e.g. `project-bootstrapper`'s destructive-delete scoping, `coverage-auditor`'s read-only
contract). If you edit one skill/agent's logic, update its counterpart(s) in the same change.

| Claude Code | OpenAI Codex CLI | GitHub Copilot |
|---|---|---|
| `CLAUDE.md` | `AGENTS.md` (root) | `.github/copilot-instructions.md` |
| `.claude/skills/*/SKILL.md` (4 skills) | `.codex/prompts/*.md` | `.github/prompts/*.prompt.md` |
| `.claude/agents/*.md` (3 agents) | `.codex/prompts/*.md` (same directory — Codex has no tool-restricted subagent concept, so the tool-boundary contract is stated as an instruction instead of enforced) | `.github/chatmodes/*.chatmode.md` (tool lists set per mode, e.g. `coverage-auditor`'s mode omits `editFiles`) |

Invocation differs per tool: Codex CLI prompts are invoked with `/<name>` if the build reads
project-local prompts, otherwise copy the file into `~/.codex/prompts/` or follow its steps
directly; Copilot prompt files are invoked with `/<name>` in Copilot Chat, and chat modes are
selected from the mode picker. Neither tool has a background/foreground execution model like the
Agent tool's — treat every ported agent as a synchronous, foreground task.
