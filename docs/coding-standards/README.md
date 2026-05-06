# Reply Better AI — Coding Standards

Working agreements for this browser extension. The aim is to keep the
codebase small, predictable, and reviewable; every rule here exists
because we hit a real problem without it.

If you're new to the codebase, read in this order:

1. [Architecture](./architecture.md) — file layout, build pipeline, manifest pair, MV3 lifecycle
2. [JavaScript style](./javascript-style.md) — naming, modules, comments, project-wide conventions
3. [Error handling](./error-handling.md) — typed errors, `userMessage`, no `alert()`, fail-closed
4. [Security](./security.md) — permissions, content scripts, storage, what NEVER to do
5. [Testing](./testing.md) — vitest patterns, what to mock, what's worth testing

## Quick rules at a glance

| Topic | Rule |
|-------|------|
| Imports | ES modules. Always import from `src/lib/browser.js`, never reference `chrome.*` directly. |
| Storage | Credentials and per-device settings live in `storage.local`. Never `storage.sync` for anything secret. |
| Errors | Throw a typed class from `src/lib/errors.js`. Never `alert()`. Surface to the user via `showBanner` / `showToast`. |
| Comments | Default to none. Add only when WHY is non-obvious (constraint, invariant, workaround). One line max. |
| Permissions | Add nothing speculative. Each entry in `permissions` / `host_permissions` must trace to a concrete call. |
| DOM | No `innerHTML` with anything other than hardcoded literals. Use `textContent` / `replaceChildren` / `createElement`. |
| Cross-browser | Bundle via esbuild (`build.mjs`). Single source, two manifests. Keep parity. |
| Tests | `npm test` must stay green. New behaviour merits a new test if it has branches. |

## Before opening a PR

- `npm run build` produces both `dist/chrome` and `dist/firefox` without warnings
- `npm test` is green
- Manual smoke test on at least one of Chrome / Firefox: popup opens, model picker loads, a real `improveText` call returns
- No new entries in `manifest.*.json` `permissions` / `host_permissions` without a one-line justification in the PR description
- `git diff main..HEAD` reads cleanly: each commit is one logical change, conventional-commit subject

## Conventions taken from upstream

- **Conventional Commits** for every commit message (`feat`, `fix`, `refactor`, `chore`, `test`, `docs`). No `Closes #N`; that goes in the PR description.
- **One source of truth** for repeated values: `src/lib/constants.js`, `src/data/popular-models.js`, `src/lib/system-prompts.js`. If you spell the same string twice, lift it to a constant.

## When to update these docs

- A PR review surfaces a recurring class of mistake → add a section
- A new third-party dependency or browser API enters the codebase → document the WHY
- A rule here turns out to be wrong → fix it; don't carry forward stale advice

Last touched: 2026-05-06.
