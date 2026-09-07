---
description: Resets an existing apitest project directory back to a clean slate and points it at a different target API. Destructive — only use with an explicit target directory and new spec in mind, never as a default mode.
tools: ['codebase', 'search', 'editFiles', 'runCommands']
---

You reset one apitest project directory and repoint it at a new OpenAPI spec. You must be given,
or must ask for, both: the **target project directory** (has its own `apitest.config.ts`; default
to `examples/assertquest` only if the user confirms that's what they mean) and the **new spec**
(URL or local file). If either is missing, stop and ask.

Never operate outside the target directory.

## Step 1 — confirm this is a real apitest project

Read `<target>/apitest.config.ts` and confirm `<target>/package.json` exists — if either is
missing, stop. Note the current `spec:` value.

## Step 2 — clean, but only the regenerable/project-specific pieces

Delete, inside `<target>/` only: `scenarios/**`, `customSteps/**`, `queries/**`, `seeds/**` (if
present), `.spec-cache/`, `allure-results/`, `allure-report/`, `test-results/`,
`playwright-report/`, `schemas/scenario.schema.json`.

**Never delete:** `node_modules/`, `package.json`, `package-lock.json`, `playwright.config.ts`,
`README.md`, `environments/*.env` (real credentials — leave a live `dev.env` in place and flag in
your report that it still holds credentials for the old API). `apitest.config.ts` gets overwritten
in Step 3, not deleted here.

List exactly what you're about to remove before deleting. Scope every delete to the specific
subpaths above — never a bare recursive delete of the whole target directory.

## Step 3 — point at the new spec

```
cd <target>
npx apitest init --spec <new-spec>
```
Overwrites `apitest.config.ts` and `environments/dev.env.example`. Read the console output for
which `securitySchemes` entries need manual review (oauth2/openIdConnect stubs, query-string
api-key isn't auto-configurable). Hand-fix obviously-wrong guesses; flag ambiguous ones for the
user.

## Step 4 — mandatory config the user still has to fill in

Copy `environments/dev.env.example` to `environments/dev.env` only if it doesn't already exist —
never invent credentials, never overwrite a live file. List every var needing a real value.

## Step 5 — sync and validate the empty project

```
npx apitest sync
npx apitest check
```
Should pass with zero scenarios. If `sync` fails, stop and report — don't fabricate a scenario
against a spec that never synced.

## Step 6 — write one minimal scenario

Pick one safe, side-effect-free operationId (prefer GET/health-check over anything mutating).
Write `scenarios/smoke.scenario.yaml`:
```yaml
# yaml-language-server: $schema=../schemas/scenario.schema.json
name: smoke
tags: [smoke]
auth: none          # or a real role name if the operation requires it
steps:
  - name: <short description>
    operation: <operationId>
    assert:
      - status: 200
```
Re-run `npx apitest check`, then `npx apitest schema`. Don't run `apitest run` unless real
credentials are already confirmed in `environments/dev.env`.

## Step 7 — report

Target directory and old → new spec; what was deleted (by category); what `apitest init`
auto-configured vs. needs review; env vars still needing values; the new scenario file and check
result; explicit next step — fill `environments/dev.env`, then `npx apitest run --tag smoke`.
