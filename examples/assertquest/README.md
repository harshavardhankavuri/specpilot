# assertquest-example

A full worked `@assertquest/specpilot` example against the **SwiftCargo API**, a freight-forwarding
service hosted at `https://assertquest.com/docs/json`. It demonstrates most of the framework's
surface: four bearer-login auth roles (admin/dispatcher/driver/customer), chained booking/fleet
flows, `customSteps/` for setup and cleanup, a `queries/` library for db assertions, and
reliability/race-condition scenarios.

## Run it

```bash
npm install
npx apitest sync
npx apitest check
cp environments/dev.env.example environments/dev.env   # fill in real credentials
npx apitest run
```

`apitest.config.ts`, `scenarios/`, `customSteps/`, and `queries/` here are all real, filled-in
content — read them directly as a reference for writing your own project, or use them as a
starting point via copy-paste.

## Depending on @assertquest/specpilot locally

This project's `package.json` depends on `@assertquest/specpilot` via `file:../..` since no version
is published to npm yet — a real consumer would use a published semver range instead. One
consequence of the local `file:` link: because this checkout's own root package.json *also*
installs its own copy of `@playwright/test` (needed for the framework's own typecheck/tests),
running `apitest run` from here can hit a Node "requiring @playwright/test a second time" error
caused by symlink resolution finding both copies. `apitest sync` and `apitest check` are
unaffected (they never load Playwright). This is specific to local `file:`-linked development in
this same repo — it does not occur for a real npm-installed dependency (verified via a packed
tarball install, which runs cleanly end to end).

## Full field reference

See the root [README](../../README.md) and [`docs/scenario-format.md`](../../docs/scenario-format.md) /
[`docs/custom-steps.md`](../../docs/custom-steps.md) for everything the scenario/custom-step
formats support.
