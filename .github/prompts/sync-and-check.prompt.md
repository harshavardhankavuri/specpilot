---
mode: agent
description: Run apitest sync and apitest check, and triage failures, without dumping the full synced OpenAPI spec into the conversation.
tools: ['runCommands', 'search']
---

1. `npx apitest sync` — writes/refreshes `.spec-cache/`. Required before `run`/`check`.
2. `npx apitest check` — validates every scenario's `operationId`/params against the synced spec,
   no requests sent. Passes even with zero scenarios authored.
3. Triage failures from the command output alone — don't open `.spec-cache/spec.json` or re-read
   every `scenarios/*.yaml` file by hand. The CLI output names the failing file and the specific
   `operationId`/param mismatch.
   - Unknown `operationId` → grep `.spec-cache/` for the closest match.
   - Missing/extra required param → open only the flagged scenario file.
4. `check` does **not** verify `custom:`/`cleanup:` export names — a clean `check` doesn't
   guarantee those resolve; only `apitest run` does.

Skip `sync` if `.spec-cache/` was already synced earlier in this session and the source hasn't
changed — go straight to `check`.

If check passes cleanly, report that in one line; don't summarize the spec or restate scenario
contents back.
