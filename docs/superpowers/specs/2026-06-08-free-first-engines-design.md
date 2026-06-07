# Design: Free-first tiered engines

_Date: 2026-06-08 · Status: approved (proceed) · Branch: `feature/v1.5-free-engines` (off `feature/v1.4-reply-mode`)_

## Problem

The extension's core value is being **free**. Today the only free path is OpenRouter's free tier, which is unreliable and slow: ~50 requests/day under $10 lifetime credit (~1000/day above), 20/min, and failed attempts count against the quota. Users who don't want to pay hit constant 429s. We need a free experience that is reliable and fast, ideally zero-setup, across Chrome and Firefox, without the developer paying per use.

## Decision (the core tradeoff)

"Truly free + zero-setup + works on every device + developer pays nothing" cannot all be true at once — someone must provide the compute. **Chosen tradeoff: (A)** — on-device when the device supports it; otherwise a guided one-time free API key. The developer never pays and never hosts a proxy.

Result:
- Capable Chrome desktops → **truly free, zero-setup, on-device** (Gemini Nano).
- Everyone else (Firefox, weak/old/mobile devices) → **guided one-time free key (Groq)** — fast, ~1000 req/day per user (BYOK, so per-user, not shared).
- Power users → existing OpenRouter / paid models.

"Guaranteed free for literally everyone with zero setup and zero developer cost" is not achievable; this design gets the largest possible share to zero-setup-free and gives everyone else a genuinely good one-time-setup free option.

## Goals / Non-goals

**Goals:** free-by-default experience; zero developer cost and no developer-hosted compute; reliable + fast free path; works on Chrome and Firefox; transparent about which engine/model answered; preserves the security invariant (API keys never leave the service worker; on-device uses no key).

**Non-goals (v1):** developer-hosted proxy (cost + abuse risk); WebLLM / in-browser WebGPU local models (multi-GB download, heavy — possible future opt-in for Firefox privacy users); Safari; changing the prompt logic.

## Architecture (Approach 1: engine layer)

An **engine** = where inference runs. It sits above the existing model concept; the model picker / "Auto · Fastest free" only apply to cloud engines.

### Engine interface (the core unit)

```
Engine = {
  id,                       // "on-device" | "groq" | "openrouter"
  label,
  kind,                     // "on-device" | "cloud"
  availability(),           // -> "ready" | "needs-setup" | "downloadable" | "unsupported"
  streamImprove({ text, systemPrompt, signal, onChunk, onModel }) -> fullText
}
```

All engines take the same `{ systemPrompt, text }`, so reply mode and improve mode work unchanged across engines (`system-prompts.js` is untouched).

### The three engines

- **on-device** (Chrome Gemini Nano): `availability()` wraps `LanguageModel.availability()`; `streamImprove()` creates a `LanguageModel` session (system prompt + user text) and streams tokens. **No API key.** Runs in the extension context (service worker — to be validated; see Risks).
- **groq** (cloud-free): `availability()` = is a Groq key stored; `streamImprove()` = OpenAI-compatible `POST api.groq.com/openai/v1/chat/completions` with the user's Groq key, streaming. The existing `openrouter.js` streaming client is generalized to take a base URL + key + model so Groq and OpenRouter share one client.
- **openrouter** (cloud-premium): the existing path; model picker + "Auto · Fastest free" + per-request routing apply only here.

### Service-worker dispatch

The existing `rb-improve-stream` port becomes engine-aware: it resolves the active engine and calls `engine.streamImprove(...)`, relaying deltas/model/error back to the panel exactly as today. The popup uses the same engine layer directly. The key-in-SW invariant holds: cloud keys are read only in the worker; on-device needs no key.

### Selection logic

Stored setting `engine`, default `"auto"`. `auto` resolves to: on-device if `ready`/`downloadable` → else Groq if a Groq key is set → else OpenRouter if a key is set → else onboarding. The user can pin an explicit engine in settings.

### First-run / onboarding

On install: detect on-device availability.
- Available → "Free, private, on-device AI is available — enable it?" (triggers the one-time model download).
- Not available → "Power it free: get a free Groq key (guided), or add your own OpenRouter key for premium models."

### Transparency

The popup/panel header shows the active engine ("On-device · free", "Groq · free", or the model name for premium). The existing "Answered by X" extends to name the engine (so on-device/auto is never a black box).

### Storage

New: `engine` (selection), `groqApiKey` (kept separate from the OpenRouter `apiKey`). Both in `storage.local`, never synced.

## Fallback chain (runtime)

If the active engine errors, fall back engine-aware: on-device failure (not ready / throws) → cloud-free (Groq) if a key exists; Groq rate-limit/error → the existing error-recovery block, made engine-aware ("switch engine / retry / go premium"). This is the cross-engine generalization of the v1.4 Auto + error-recovery work.

## Firefox

No Chrome built-in AI. Default engine = Groq-free (guided key) or OpenRouter. WebLLM is out of v1 scope (noted as a future optional "fully local" mode).

## Risks & validation (POC FIRST)

The whole plan depends on Gemini Nano (a) being available on real user devices and (b) producing acceptable rewrite/reply quality (it is a small 2B/4B model). Neither is validated.

**Phase 1 is a POC**, not the full build: wire the on-device engine into the improve path behind a flag; on a real machine measure `availability()`, output quality vs cloud, and latency. Decide from evidence whether on-device is the free *default* or an opt-in, before building the full engine layer + onboarding. Also validate the open technical question: is the Prompt API callable from the MV3 service worker (vs content script)?

## Phasing

1. **POC / validation** — on-device engine behind a flag; measure availability + quality + speed on a real device; confirm Prompt-API-in-SW. Go/no-go on on-device as default.
2. **Engine abstraction** — `src/engines/` registry + interface; generalize the streaming client (base URL + key) so Groq + OpenRouter share it; SW relay → engine dispatch. No behavior change for existing OpenRouter users.
3. **On-device engine** — wire Gemini Nano as the `on-device` engine (per Phase 1 outcome).
4. **Groq cloud-free engine** — direct Groq client + guided key onboarding.
5. **Selection + first-run + transparency UI** — engine selector, auto-resolution, install onboarding, header engine label.
6. **Cross-engine fallback + error recovery** — engine-aware error block.

## Code-change map

- New `src/engines/` (`index.js` registry, `on-device.js`, `cloud.js` [shared Groq/OpenRouter client]).
- `src/background/service-worker.js` — engine dispatch in the relay + the `improveText` path.
- `src/lib/openrouter.js` — generalize the streaming client to (baseUrl, key, model); openrouter + groq reuse it.
- `src/lib/constants.js` — engine ids, Groq base URL.
- `src/lib/storage.js` — `engine`, `groqApiKey`.
- Popup / options — engine selector + first-run; model picker scoped to cloud engines.
- `src/content/panel.js`, `src/popup/index.js` — show the active engine.
- `src/lib/system-prompts.js` — unchanged.
