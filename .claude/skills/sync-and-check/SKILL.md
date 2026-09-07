---
name: sync-and-check
description: Run apitest sync and apitest check, and triage failures, without dumping the full synced OpenAPI spec into context.
---

# Sync spec and validate scenarios

## Steps

1. Run:
   ```
   npx apitest sync
   ```
   Writes/refreshes `.spec-cache/`. Required before `run`/`check` (Playwright collects tests
   synchronously and needs the cache present).
2. Run:
   ```
   npx apitest check
   ```
   Validates every scenario's `operationId`/params against the synced spec, without sending any
   requests. Passes even with zero scenarios authored.
3. Triage failures from the command output alone — don't open `.spec-cache/spec.json` or re-read
   every `scenarios/*.yaml` file to cross-check by hand. The CLI output already names the failing
   file and the specific `operationId`/param mismatch.
   - Unknown `operationId` → grep `.spec-cache/` for the closest match rather than reading the
     whole cached spec.
   - Missing/extra required param → open only the one flagged scenario file, not the whole
     `scenarios/` directory.
4. Remember `check` does **not** verify `custom:`/`cleanup:` export names (see
   `/add-custom-step`) — a clean `check` doesn't guarantee those resolve; only `apitest run` does.

## When to skip `sync`

If `.spec-cache/` was already synced earlier in this session and the OpenAPI source hasn't
changed, re-running `sync` is a wasted network round-trip — go straight to `check`.

## Token-efficiency notes

- Never Read the full `.spec-cache/` cache file to "double check" a `check` failure the CLI
  already pinpointed — trust the CLI's error location.
- If check passes cleanly, report that in one line; don't summarize the spec or restate the
  scenario contents back to the user.
