# Design: Local LLM engine (Ollama / LM Studio / OpenAI-compatible)

_Date: 2026-06-18 · Status: approved (proceed) · Branch: `feature/local-llm-engine` (off `main`)_

Tracking issue: dantnan/reply-better-ai#4

## Problem

The free, private path today is **on-device** (Gemini Nano) — great, but limited to capable Chrome desktops and a single small model. Many users already run local LLMs via **Ollama** or **LM Studio**: dozens of models they've pulled, on their own hardware, fully offline, no API key. There's no way to point the extension at them.

We want a generation engine that targets any **local OpenAI-compatible server** — Ollama, LM Studio, and by extension llama.cpp / vLLM / LiteLLM — giving users a free, private, offline option with a much larger model catalog than on-device, and no per-request cloud dependency.

## Decision (the core tradeoff)

Add **one "Local (OpenAI-compatible)" engine**, not one engine per vendor. Vendor differences (default port, label) are handled by **quick-fill presets** over a single editable base-URL field. This keeps the engine picker short and covers any OpenAI-compatible local runtime, not just the two named ones.

Both Ollama (`:11434`) and LM Studio (`:1234`) speak OpenAI-compatible `/v1/chat/completions` with SSE streaming, so the existing shared streaming client (`streamImproveText`) is reused verbatim — this is an engine variant + settings/manifest/docs wiring, not a new API client.

## Goals / Non-goals

**Goals:** free, private, offline generation against a user's local server; zero API key; works in Chrome and Firefox; reuse the existing streaming client and engine interface unchanged; live model listing from the running server; configurable base URL; preserve the security invariant (no key to leak; requests issued from the service worker / popup / options page, never page/content context).

**Non-goals (v1):** bundling or auto-installing Ollama/LM Studio; managing/pulling models from the extension; non-OpenAI-compatible local APIs (Ollama's native `/api/tags` is unnecessary since `/v1/models` covers it uniformly); putting Local into the `auto` fallback chain (opt-in via explicit selection — see Decisions); LM Studio's optional server API key (default is keyless; an enabled key surfaces as a 401 the user can read — a key field can be a later add).

## Architecture

The local engine implements the same `Engine` interface as the others:

```
Engine = {
  id: "local",
  label: "Local (OpenAI-compatible)",
  kind: "local",
  availability(),   // -> "ready" (base URL configured) | "needs-setup" (no base URL)
  streamImprove({ text, systemPrompt, signal, onChunk, onModel }) -> fullText
}
```

### `availability()` does NO network call — this is load-bearing

`availability()` is consumed on hot paths: `resolveActiveEngine()` (src/engines/index.js:68) runs on every popup open and every service-worker stream request, and `orderedEngines()` (index.js:48) gates the *other* engines on cheap synchronous `!!apiKey` storage reads. Putting a localhost `fetch` in `availability()` would add a round-trip — or a full timeout when the server is down — to every generation, even for users not using Local.

So `local.availability()` is a **pure storage read**: returns `ready` iff a non-empty `localBaseUrl` is stored, else `needs-setup`. It never pings. Actual reachability is verified in exactly two places, both off the hot path:
1. **At stream time** — if the server is down, the shared client's `fetch` rejects and surfaces as a `NetworkError` (src/lib/openrouter.js:80-82) with copy pointing at "is your local server running?".
2. **In the options UI** — an explicit, user-initiated probe (the model-list fetch / "Connected · N models" status) that runs only on the options/popup settings surface.

### Selection — explicit pick is honored, never gated by reachability

`resolveEngineId` (index.js:32-37) is pure and already returns any `engineSetting` that is `in ENGINES` (line 33). Registering `local` in `ENGINES` makes explicit selection work with **no new branch and no reachability input threaded through** — which is exactly what we want: if a user explicitly chooses Local, honor it and let a dead server surface as a stream-time `NetworkError`, rather than silently falling back. Local is **not** added to the `auto` resolution or to `orderedEngines`'s fallback chain in v1 (an unreachable localhost must not add latency/timeouts to `auto`).

### How it differs from `makeCloudEngine`

The cloud factory is key-centric (`availability()` checks for a key; `streamImprove` throws `InvalidKeyError` without one — cloud.js:15-18, 23). Local is reachability-centric and keyless. Rather than bend `makeCloudEngine`, add a sibling **`makeLocalEngine()`** in `src/engines/local.js` that:

1. **`availability()`** — pure storage read (above).
2. **`streamImprove(...)`** — reads `localBaseUrl` + `localModel`, guards against an unset `localModel` (friendly "pick a model" error rather than sending `model: undefined`, which servers 400), and calls the shared `streamImproveText({ baseUrl, model, ... })` with **no API key**.
3. **`listLocalModels(baseUrl)`** — `GET {baseUrl}/models`, timeout-bounded (reuse the `timeoutFetch` pattern from openrouter.js:19-23 / `listModels` at :159-169), returns `[]` on a non-array/bad-shape body. Parses the standard `{ data: [{ id }, ...] }` shape (confirmed identical for Ollama and LM Studio).

### Shared streaming client change

`streamImproveText` (src/lib/openrouter.js:66) always sets `Authorization: Bearer ${apiKey}`. Make that header **conditional on a truthy key**, so a keyless local request omits it. Safe for all existing callers: every cloud caller routes through `makeCloudEngine`, which throws before calling the client when the key is missing (cloud.js:23), so cloud requests always pass a key. The OpenRouter-specific `HTTP-Referer` / `X-Title` headers (openrouter.js:74-76) are left in place intentionally — Ollama/LM Studio ignore unknown headers. No other transport change; SSE parsing, abort, and `cleanModelOutput` are untouched. (Note: the streaming path uses plain `fetch` with the caller's abort signal and *no* timeout wrapper — correct here, so a large local model's cold-start load doesn't get killed mid-generation.)

### Storage keys

- `localBaseUrl` — e.g. `http://localhost:11434/v1` (set from a preset, editable)
- `localModel` — selected model id
- `localPreset` — `"ollama" | "lmstudio" | "custom"` (UI convenience; could be derived from `localBaseUrl`, kept for unambiguous button highlighting)

### Constants

`LOCAL_PRESETS` in `constants.js`:
- Ollama → `http://localhost:11434/v1`
- LM Studio → `http://localhost:1234/v1`
- Custom → empty (user supplies)

## UI

Engine picker (`src/options/options.html:42-47`) gains one entry: `Local (OpenAI-compatible) — local, no key`.

Local config block (options page + popup settings), shown when Local is the selected engine:

```
Preset:   [ Ollama ]  [ LM Studio ]  [ Custom ]
Base URL: http://localhost:11434/v1        (prefilled by preset, editable)
Model:    <live dropdown from listLocalModels(baseUrl)>
Status:   ● Connected · N models  /  ○ Can't reach server  /  ○ Reachable, no models loaded
```

- Preset buttons fill the base URL; the field stays editable.
- The model dropdown + status run the **only** reachability probe, user-initiated on the options/popup surface (never a content script — architecture.md:117-118 forbids network from content). Empty list (`N = 0`) shows "reachable, no models" guidance (esp. LM Studio: load a model / enable JIT).
- Failure copy distinguishes "can't reach server" from a successful-but-empty list. CORS-vs-refused cannot be told apart from a thrown `TypeError: Failed to fetch`, so the probe's failure copy bundles both causes into one actionable message ("Can't reach the server. Check it's running and CORS is enabled — see setup.") rather than guessing.

## Permissions & CORS

- **`host_permissions`**: add `http://localhost/*` and `http://127.0.0.1/*` to **both** `manifest.chrome.json` and `manifest.firefox.json` (same commit, per the manifest-pair rule). The `http://` scheme must be explicit — permissions are granted by host *and* scheme. **No CSP change** — the existing `script-src 'self'; object-src 'self'` has no `connect-src`, and MV3 gates network on `host_permissions`, not CSP.

- **CORS is browser-asymmetric** and must be documented per-browser:
  - **Chrome MV3:** a fetch from the service worker / extension pages with matching `host_permissions` is **CORS-exempt**. Ollama (whose default allows only `127.0.0.1`/`0.0.0.0`) typically works with **zero extra config** on Chrome.
  - **Firefox MV3:** `host_permissions` do **not** exempt requests from CORS — the server must return CORS headers. So Firefox users **must** configure the server origin.
  - **Ollama:** to allow the extension, run with `OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*` (Firefox's `moz-extension://<uuid>` is per-install, so a wildcard is required — a fixed origin can't be documented).
  - **LM Studio:** the **"Enable CORS" toggle is OFF by default** (Server Settings, or `lms server start --cors`). It must be turned on or *every* browser request fails — this is the most common first-run breakage and gets top billing in the docs and in the failure copy.

## Error handling

Reuse the typed errors in `src/lib/errors.js`:
- **Server unreachable** (stream path): `fetch` rejection → `NetworkError`, copy pointing at "is your local server running? (CORS may need enabling — see setup)".
- **No model selected**: guarded in `streamImprove` before the request — friendly "pick a model" message, not a server 400.
- **Reachable but model not loaded** (LM Studio): server returns non-OK → flows through `fromResponse` as `ProviderError`; copy hints at loading a model.
- **Empty completion**: existing `ProviderError("Empty response from model")` path.

## Testing

Following `tests/engines.test.js` and `tests/openrouter.test.js` conventions:

- `resolveEngineId` returns `local` when `engine === "local"`, and **never** returns `local` from `auto` (regression guard for the opt-in decision).
- `makeLocalEngine().availability()` — `ready` with a stored base URL, `needs-setup` without one, and asserts **no fetch is issued** (the hot-path guarantee).
- `streamImprove` guards an unset `localModel` (throws the friendly error, issues no request).
- `listLocalModels` — parses `{ data: [...] }`, returns `[]` on bad shape, honors the timeout.
- `streamImproveText` omits `Authorization` when no key is passed and still sets it for cloud callers (regression guard).

## Files changed (delivery surface)

| File | Change |
|------|--------|
| `src/engines/local.js` (new) | `makeLocalEngine()` + `listLocalModels()`. |
| `src/engines/index.js` | Register `local` in `ENGINES`. |
| `src/lib/constants.js` | `LOCAL_PRESETS`, default local base URL. |
| `src/lib/openrouter.js` | Conditional `Authorization` header. |
| `src/lib/storage.js` | (If keys are enumerated anywhere) add `localBaseUrl`, `localModel`, `localPreset`. |
| `src/options/options.html` | `<option value="local">` + the local config block markup. |
| `src/options/index.js` | Preset buttons, base-URL persistence, live model dropdown, status probe, wiring to `persist`/`updateActiveEngineLabel`. |
| `src/popup/components/settings-ui.js` + `ModelPicker.js` | Local model selection in the popup settings surface. |
| `manifest.chrome.json` + `manifest.firefox.json` | `http://localhost/*`, `http://127.0.0.1/*` in `host_permissions` (both, same commit). |
| `docs/local-llm-setup.md` (new) + README link | Setup: install/run Ollama or LM Studio, **enable LM Studio CORS**, `OLLAMA_ORIGINS` for Firefox, pick a model. Per-browser CORS notes. |
| `tests/` | The cases above (extend `tests/engines.test.js`, `tests/openrouter.test.js`; new `tests/local.test.js` if cleaner). |

## Decisions captured

- **One combined Local engine** + presets, not separate Ollama/LM Studio engines (shorter picker, broader compat). Maintainer asked in issue #4 whether to split — revisit if requested.
- **Opt-in only** for v1 (not in `auto`/fallback), to keep `auto` resolution fast and predictable.
- **`availability()` never pings** — pure storage read; reachability is lazy (stream-time error) + on-demand (options probe).
- **CORS documented per-browser** — Chrome usually zero-config for Ollama; Firefox + LM Studio always require server-side config.
