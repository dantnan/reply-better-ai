# Design: Local LLM engine (Ollama / LM Studio / OpenAI-compatible)

_Date: 2026-06-18 · Status: approved (proceed) · Branch: `feature/local-llm-engine` (off `main`)_

Tracking issue: dantnan/reply-better-ai#4

## Problem

The free, private path today is **on-device** (Gemini Nano) — great, but limited to capable Chrome desktops and a single small model. Many users already run local LLMs via **Ollama** or **LM Studio**: dozens of models they've pulled, on their own hardware, fully offline, no API key. There's no way to point the extension at them.

We want a generation engine that targets any **local OpenAI-compatible server** — Ollama, LM Studio, and by extension llama.cpp / vLLM / LiteLLM — giving users a free, private, offline option with a much larger model catalog than on-device, and no per-request cloud dependency.

## Decision (the core tradeoff)

Add **one "Local (OpenAI-compatible)" engine**, not one engine per vendor. Vendor differences (default port, label) are handled by **quick-fill presets** over a single editable base-URL field. This keeps the engine picker short and covers any OpenAI-compatible local runtime, not just the two named ones.

Both Ollama (`:11434`) and LM Studio (`:1234`) speak OpenAI-compatible `/v1/chat/completions` with SSE streaming, so the existing shared streaming client (`streamImproveText`) is reused verbatim — this is an engine variant + settings/manifest wiring, not a new API client.

## Goals / Non-goals

**Goals:** free, private, offline generation against a user's local server; zero API key; works in Chrome and Firefox; reuse the existing streaming client and engine interface unchanged; live model listing from the running server; configurable base URL; preserve the security invariant (no key to leak; requests issued from the service worker / popup, never page context).

**Non-goals (v1):** bundling or auto-installing Ollama/LM Studio; managing/pulling models from the extension; non-OpenAI-compatible local APIs (Ollama's native `/api/generate` is unnecessary since `/v1` covers it); putting Local into the `auto` fallback chain (opt-in via explicit selection for v1 — see Decisions).

## Architecture

The local engine implements the same `Engine` interface as the others:

```
Engine = {
  id: "local",
  label: "Local (OpenAI-compatible)",
  kind: "local",
  availability(),   // -> "ready" (server reachable) | "needs-setup" (no base URL / unreachable)
  streamImprove({ text, systemPrompt, signal, onChunk, onModel }) -> fullText
}
```

### How it differs from `makeCloudEngine`

The cloud factory is key-centric: `availability()` checks for a stored key and `streamImprove` throws `InvalidKeyError` without one. Local is reachability-centric. Rather than bend `makeCloudEngine`, add a sibling **`makeLocalEngine()`** in `src/engines/local.js` that:

1. **`availability()`** — returns `ready` if a base URL is configured and a short, timeout-bounded `GET {baseUrl}/models` succeeds; otherwise `needs-setup`. (Reachability, not key presence.)
2. **`streamImprove(...)`** — reads `localBaseUrl` + `localModel` from storage and calls the shared `streamImproveText({ baseUrl, model, ... })` with **no `Authorization` header**.
3. **Model listing** — `GET {baseUrl}/models` (works for both vendors; shape `{ data: [{ id }, ...] }`).

### Shared streaming client change

`streamImproveText` in `src/lib/openrouter.js` currently always sets `Authorization: Bearer ${apiKey}`. Make the auth header **conditional on a key being present**, so a keyless local request omits it. No other transport change — the SSE parsing, abort, timeout, and `cleanModelOutput` paths are identical. Existing cloud callers always pass a key, so their behavior is unchanged.

### Service-worker dispatch & selection

`src/engines/index.js` registers `local` in `ENGINES`. `resolveEngineId` gains a `local` branch driven by an explicit `engine === "local"` setting. For v1, Local is **not** auto-selected (an unreachable localhost server should not silently add latency/failures to `auto` resolution); it's chosen explicitly in settings. `orderedEngines` may include it as a fallback only when already reachable — deferred to keep v1 focused.

### Storage keys

- `localBaseUrl` — e.g. `http://localhost:11434/v1` (default from preset, editable)
- `localModel` — selected model id
- `localPreset` — `"ollama" | "lmstudio" | "custom"` (UI convenience)

### Constants

`LOCAL_PRESETS` in `constants.js`:
- Ollama → `http://localhost:11434/v1`
- LM Studio → `http://localhost:1234/v1`
- Custom → empty (user supplies)

## UI

Engine picker gains one entry: `Local (OpenAI-compatible) — local, no key`.

Local config block (options page + popup settings), shown when the engine is/relates to Local:

```
Preset:   [ Ollama ]  [ LM Studio ]  [ Custom ]
Base URL: http://localhost:11434/v1        (prefilled by preset, editable)
Model:    <live dropdown from GET {baseUrl}/models>
Status:   ● Connected · N models   /   ○ Not reachable
```

- Preset buttons fill the base URL; the field stays editable.
- Model dropdown populates live; on failure, show actionable copy distinguishing "server not running" from "origin not allowed (CORS)".

## Permissions & CORS

- **`host_permissions`**: add `http://localhost/*` and `http://127.0.0.1/*` to **both** `manifest.chrome.json` and `manifest.firefox.json` (same commit, per the manifest-pair rule).
- **Server-side CORS** (user setup, documented, not code): Ollama requires `OLLAMA_ORIGINS` to allow the extension origin; LM Studio has a CORS toggle. Docs will cover both.

## Error handling

Reuse the typed errors in `src/lib/errors.js`. Map connection refusal / DNS / timeout to `NetworkError` with copy that points at "is your local server running?". A reachable server returning a non-OK status flows through `fromResponse` as today. Empty/blank completions reuse the existing `ProviderError("Empty response from model")` path.

## Testing

Following `tests/engines.test.js` and `tests/openrouter.test.js` conventions:

- `resolveEngineId` returns `local` when `engine === "local"`; local is **not** chosen by `auto`.
- `makeLocalEngine().availability()` — `ready` on a mocked successful `/models`, `needs-setup` on no base URL and on a failed/timed-out fetch.
- Model-list parsing from the `{ data: [...] }` shape.
- `streamImproveText` omits `Authorization` when no key is passed and still sets it for cloud callers (regression guard).

## Decisions captured

- **One combined Local engine** + presets, not separate Ollama/LM Studio engines (shorter picker, broader compat). Maintainer asked in issue #4 whether to split — revisit if requested.
- **Opt-in only** for v1 (not in `auto`), to keep `auto` resolution fast and predictable.
