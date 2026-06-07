# Free-First Engines — Build Plan (Phases 2-3: engine abstraction + on-device)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Introduce an engine abstraction above the model layer and wire Chrome's on-device AI (Gemini Nano) as the automatic, zero-setup, free default when available — with the existing OpenRouter path unchanged as the fallback. Delivers a working "free on-device default" in the real extension.

**Architecture:** A small `Engine` interface (`availability()` + `streamImprove()`) with a registry and a pure auto-resolver. Three engines will exist by the end of the larger effort; this plan adds the abstraction, the **openrouter** engine (wrapping today's path, no behavior change), and the **ondevice** engine (Gemini Nano via `LanguageModel`, runs in the MV3 service worker — confirmed by the Phase-1 POC). The SW relay and popup call the active engine instead of `streamImproveText` directly. Keys never leave the SW; on-device uses no key.

**Tech Stack:** Chrome/Firefox MV3, vanilla JS, esbuild. Tests: vitest on Node 22 (`export PATH=/home/amali/.nvm/versions/node/v22.22.0/bin:$PATH`). Real-Chrome verification by loading the built `dist/chrome` unpacked (on-device can't be exercised over file://).

**Spec:** `docs/superpowers/specs/2026-06-08-free-first-engines-design.md` · **POC results:** `docs/superpowers/notes/2026-06-08-ondevice-poc-results.md`

**Scope of THIS plan:** Phases 2-3. Phases 4-6 (Groq cloud-free engine + guided key, engine selector + first-run + transparency UI, cross-engine fallback) are outlined at the end and detailed in a follow-up plan after this milestone ships.

---

## File structure

- Create `src/engines/index.js` — registry + `resolveEngineId()` (pure) + `resolveActiveEngine()`.
- Create `src/engines/ondevice.js` — Gemini Nano engine.
- Create `src/engines/cloud.js` — `makeCloudEngine()` factory (used by openrouter now, groq later).
- Modify `src/lib/openrouter.js` — generalize `streamImproveText` to accept a `baseUrl` (default OpenRouter).
- Modify `src/lib/constants.js` — add `DEFAULT_ENGINE = "auto"`.
- Modify `src/background/service-worker.js` — relay calls the active engine.
- Modify `src/popup/index.js` — `runImprove` calls the active engine.
- Modify `src/lib/system-prompts.js` — add a fact-preserving clause to the improve prompts.
- Tests: `tests/engines.test.js` (new).

Each engine file has one responsibility and a uniform interface, so the SW/popup call them without knowing which engine is active.

---

## Phase 2 — Engine abstraction (no behavior change for existing users)

### Task 2.1: Generalize the cloud streaming client

**Files:**
- Modify: `src/lib/openrouter.js` (the `streamImproveText` signature + its fetch URL)
- Test: `tests/openrouter.test.js` (existing — add one case)

- [ ] **Step 1: Add a `baseUrl` param (default OpenRouter)**

In `src/lib/openrouter.js`, change the signature and the fetch URL:

```js
export async function streamImproveText({ text, apiKey, model, models, systemPrompt, onChunk, onModel, signal, baseUrl = OPENROUTER_BASE }) {
  // ...
  response = await fetch(`${baseUrl}/chat/completions`, { /* unchanged */ });
  // ...
}
```

(Only the URL base changes; headers/body/SSE parsing are unchanged. The default keeps every existing caller working.)

- [ ] **Step 2: Add a test that a custom baseUrl is used**

In `tests/openrouter.test.js`, add:

```js
it("streams against a custom baseUrl when provided", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(
    'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n',
    { status: 200, headers: { "content-type": "text/event-stream" } },
  ));
  vi.stubGlobal("fetch", fetchMock);
  await streamImproveText({ text: "x", apiKey: "k", model: "m", systemPrompt: "s", baseUrl: "https://api.groq.com/openai/v1" });
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/chat/completions");
});
```

- [ ] **Step 3: Run tests**

Run: `export PATH=/home/amali/.nvm/versions/node/v22.22.0/bin:$PATH && npm test`
Expected: all green (95 existing + 1 new).

- [ ] **Step 4: Commit**

```bash
git add src/lib/openrouter.js tests/openrouter.test.js
git commit -m "refactor(openrouter): accept baseUrl so cloud engines can share the client"
```

### Task 2.2: Engine interface, registry, and pure resolver

**Files:**
- Create: `src/engines/cloud.js`
- Create: `src/engines/index.js`
- Modify: `src/lib/constants.js`
- Test: `tests/engines.test.js`

- [ ] **Step 1: Add the default-engine constant**

In `src/lib/constants.js` add:

```js
export const DEFAULT_ENGINE = "auto"; // "auto" | "ondevice" | "groq" | "openrouter"
```

- [ ] **Step 2: Cloud engine factory**

Create `src/engines/cloud.js`:

```js
import { storage } from "../lib/storage.js";
import { streamImproveText } from "../lib/openrouter.js";
import { InvalidKeyError } from "../lib/errors.js";

// Build a cloud engine for an OpenAI-compatible provider. `resolveModel()` returns
// { model } or { models } for the request; `keyName` is the storage key holding
// the user's API key (read in the SW/popup, never sent to page context).
export function makeCloudEngine({ id, label, baseUrl, keyName, resolveModel }) {
  return {
    id, label, kind: "cloud",
    async availability() {
      const data = await storage.get([keyName]);
      return data[keyName] ? "ready" : "needs-setup";
    },
    async streamImprove({ text, systemPrompt, signal, onChunk, onModel }) {
      const data = await storage.get([keyName]);
      const apiKey = data[keyName];
      if (!apiKey) throw new InvalidKeyError("No API key set");
      const { model, models } = await resolveModel();
      return streamImproveText({ text, apiKey, model, models, systemPrompt, baseUrl, signal, onChunk, onModel });
    },
  };
}
```

- [ ] **Step 3: Registry + pure resolver (openrouter engine only for now)**

Create `src/engines/index.js`:

```js
import { storage } from "../lib/storage.js";
import { resolveModelSelection } from "../lib/models-cache.js";
import { DEFAULT_MODEL, OPENROUTER_BASE } from "../lib/constants.js";
import { makeCloudEngine } from "./cloud.js";

const openrouterEngine = makeCloudEngine({
  id: "openrouter",
  label: "OpenRouter",
  baseUrl: OPENROUTER_BASE,
  keyName: "apiKey",
  resolveModel: async () => {
    const { model } = await storage.get(["model"]);
    return resolveModelSelection(model || DEFAULT_MODEL); // -> { model } or { models }
  },
});

export const ENGINES = { openrouter: openrouterEngine };

// Pure: decide the engine id from already-gathered inputs (unit-testable).
export function resolveEngineId({ engineSetting, onDeviceAvail, hasGroqKey, hasOpenRouterKey }) {
  if (engineSetting && engineSetting !== "auto" && engineSetting in ENGINES) return engineSetting;
  if (onDeviceAvail === "ready" || onDeviceAvail === "downloadable") return "ondevice";
  if (hasGroqKey) return "groq";
  return "openrouter";
}

export async function resolveActiveEngine() {
  const { engine, groqApiKey, apiKey } = await storage.get(["engine", "groqApiKey", "apiKey"]);
  const onDeviceAvail = ENGINES.ondevice ? await ENGINES.ondevice.availability() : "unsupported";
  const id = resolveEngineId({ engineSetting: engine, onDeviceAvail, hasGroqKey: !!groqApiKey, hasOpenRouterKey: !!apiKey });
  return ENGINES[id] || ENGINES.openrouter;
}
```

(`"ondevice"` / `"groq"` aren't in `ENGINES` yet, so `resolveEngineId` can name them but `resolveActiveEngine` falls back to openrouter until they're registered — added in Phase 3 / Phase 4.)

- [ ] **Step 4: Write resolver tests**

Create `tests/engines.test.js`:

```js
import { describe, it, expect } from "vitest";
import { resolveEngineId } from "../src/engines/index.js";

describe("resolveEngineId", () => {
  it("honors an explicit, registered engine setting", () => {
    expect(resolveEngineId({ engineSetting: "openrouter", onDeviceAvail: "ready", hasGroqKey: true, hasOpenRouterKey: true })).toBe("openrouter");
  });
  it("auto prefers on-device when available", () => {
    expect(resolveEngineId({ engineSetting: "auto", onDeviceAvail: "ready", hasGroqKey: true, hasOpenRouterKey: true })).toBe("ondevice");
    expect(resolveEngineId({ engineSetting: "auto", onDeviceAvail: "downloadable", hasGroqKey: false, hasOpenRouterKey: false })).toBe("ondevice");
  });
  it("auto falls to groq when on-device unsupported and a groq key exists", () => {
    expect(resolveEngineId({ engineSetting: "auto", onDeviceAvail: "unsupported", hasGroqKey: true, hasOpenRouterKey: false })).toBe("groq");
  });
  it("auto falls to openrouter otherwise", () => {
    expect(resolveEngineId({ engineSetting: "auto", onDeviceAvail: "unsupported", hasGroqKey: false, hasOpenRouterKey: true })).toBe("openrouter");
    expect(resolveEngineId({ engineSetting: "auto", onDeviceAvail: "unsupported", hasGroqKey: false, hasOpenRouterKey: false })).toBe("openrouter");
  });
});
```

- [ ] **Step 5: Run tests + commit**

Run: `export PATH=/home/amali/.nvm/versions/node/v22.22.0/bin:$PATH && npm test`
Expected: green.

```bash
git add src/engines/ src/lib/constants.js tests/engines.test.js
git commit -m "feat(engines): engine interface, registry, and pure auto-resolver"
```

### Task 2.3: Route the SW relay through the active engine

**Files:**
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Replace the direct call with the engine layer**

In the `rb-improve-stream` `onConnect` handler, replace the `resolveModelSelection(...) + streamImproveText({...})` block with:

```js
import { resolveActiveEngine } from "../engines/index.js";
// ...
const engine = await resolveActiveEngine();
const full = await engine.streamImprove({
  text,
  systemPrompt,
  signal: controller.signal,
  onChunk: delta => post({ delta }),
  onModel: used => post({ model: used }),
});
post({ done: true, full, engine: engine.label });
```

Do the same in `handleImproveText` (instant path): `const engine = await resolveActiveEngine(); const improvedText = await engine.streamImprove({ text, systemPrompt });` (no onChunk needed; it returns the full string).

(Remove the now-unused `resolveModelSelection`/`streamImproveText` imports from the SW if nothing else uses them; `streamImproveText` is still used inside the openrouter engine via cloud.js.)

- [ ] **Step 2: Build + run tests**

Run: `export PATH=/home/amali/.nvm/versions/node/v22.22.0/bin:$PATH && npm run build && npm test`
Expected: builds clean, tests green.

- [ ] **Step 3: Verify no behavior change (harness)**

Rebuild the content/popup harness from the session pattern (mock `chrome.*`, stub the SW port). With no on-device and an OpenRouter key set, confirm an improve still streams via the openrouter engine and the request body is unchanged (model/Auto behavior intact).

- [ ] **Step 4: Commit**

```bash
git add src/background/service-worker.js
git commit -m "feat(engines): route the stream relay + instant path through the active engine"
```

### Task 2.4: Route the popup through the active engine

**Files:**
- Modify: `src/popup/index.js`

- [ ] **Step 1: Use the engine layer in `runImprove`**

Replace the `resolveModelSelection(...) + streamImproveText({...})` block in `runImprove` with:

```js
import { resolveActiveEngine } from "../engines/index.js";
// ...
const engine = await resolveActiveEngine();
const full = await engine.streamImprove({
  text,
  systemPrompt,
  signal: controller?.signal,
  onChunk: delta => { els.output.value += delta; els.output.scrollTop = els.output.scrollHeight; },
  onModel: id => { usedModelId = id; },
});
```

Keep the existing "Answered by X" only when the engine is a cloud engine and a model id arrived (on-device reports none; the engine label covers transparency, surfaced fully in Phase 5).

- [ ] **Step 2: Build + verify (harness)** — popup still improves via openrouter when no on-device. `npm run build`, drive the popup harness.

- [ ] **Step 3: Commit**

```bash
git add src/popup/index.js
git commit -m "feat(engines): popup improve uses the active engine"
```

---

## Phase 3 — On-device engine (Gemini Nano)

### Task 3.1: Fact-preserving clause in the improve prompts

**Files:**
- Modify: `src/lib/system-prompts.js`
- Test: `tests/system-prompts.test.js` (existing)

- [ ] **Step 1: Extend the shared SUFFIX**

In `src/lib/system-prompts.js`, append to `SUFFIX`:

```js
const SUFFIX = " ... (existing text) ... Preserve all dates, numbers, names, and links exactly as written.";
```

(General quality improvement — helps every engine, especially the smaller on-device model which otherwise mis-read a date as a plain number in the POC.)

- [ ] **Step 2: Add a test asserting the clause is present**

```js
it("instructs the model to preserve dates/numbers/names", () => {
  expect(resolveSystemPrompt("improve")).toMatch(/preserve all dates, numbers, names/i);
});
```

- [ ] **Step 3: Run tests + commit**

```bash
git add src/lib/system-prompts.js tests/system-prompts.test.js
git commit -m "feat(prompts): instruct models to preserve dates/numbers/names exactly"
```

### Task 3.2: Implement the on-device engine

**Files:**
- Create: `src/engines/ondevice.js`
- Test: `tests/engines.test.js` (add availability-mapping test with a mocked global)

- [ ] **Step 1: Write the engine**

Create `src/engines/ondevice.js`:

```js
import { cleanModelOutput } from "../lib/sanitize.js";
import { ProviderError } from "../lib/errors.js";

// Chrome built-in AI (Gemini Nano) via the Prompt API. No key, runs on-device.
// `LanguageModel` is a global in extension contexts (service worker + extension
// pages); absent elsewhere (Firefox, page context) -> "unsupported".
export const onDeviceEngine = {
  id: "ondevice",
  label: "On-device · free",
  kind: "on-device",

  async availability() {
    if (typeof LanguageModel === "undefined") return "unsupported";
    try {
      const a = await LanguageModel.availability();
      if (a === "available") return "ready";
      if (a === "downloadable" || a === "downloading") return "downloadable";
      return "unsupported";
    } catch { return "unsupported"; }
  },

  async streamImprove({ text, systemPrompt, signal, onChunk }) {
    if (typeof LanguageModel === "undefined") throw new ProviderError(0, "On-device AI is unavailable");
    const session = await LanguageModel.create({ initialPrompts: [{ role: "system", content: systemPrompt }] });
    try {
      let full = "";
      const stream = session.promptStreaming(text); // chunks are deltas (confirmed in POC)
      for await (const chunk of stream) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        full += chunk;
        onChunk?.(chunk);
      }
      const cleaned = cleanModelOutput(full);
      if (!cleaned) throw new ProviderError(0, "Empty on-device response");
      return cleaned;
    } finally {
      session.destroy();
    }
  },
};
```

- [ ] **Step 2: Add an availability-mapping test**

In `tests/engines.test.js`:

```js
import { onDeviceEngine } from "../src/engines/ondevice.js";

describe("onDeviceEngine.availability", () => {
  it("returns unsupported when LanguageModel is absent", async () => {
    expect(await onDeviceEngine.availability()).toBe("unsupported");
  });
  it("maps Chrome states", async () => {
    globalThis.LanguageModel = { availability: async () => "available" };
    expect(await onDeviceEngine.availability()).toBe("ready");
    globalThis.LanguageModel = { availability: async () => "downloadable" };
    expect(await onDeviceEngine.availability()).toBe("downloadable");
    globalThis.LanguageModel = { availability: async () => "unavailable" };
    expect(await onDeviceEngine.availability()).toBe("unsupported");
    delete globalThis.LanguageModel;
  });
});
```

- [ ] **Step 3: Run tests + commit**

```bash
git add src/engines/ondevice.js tests/engines.test.js
git commit -m "feat(engines): on-device (Gemini Nano) engine"
```

### Task 3.3: Register on-device + make auto prefer it

**Files:**
- Modify: `src/engines/index.js`

- [ ] **Step 1: Add to the registry**

```js
import { onDeviceEngine } from "./ondevice.js";
export const ENGINES = { ondevice: onDeviceEngine, openrouter: openrouterEngine };
```

(`resolveEngineId` already prefers `"ondevice"` when `onDeviceAvail` is ready/downloadable, and `resolveActiveEngine` already queries `ENGINES.ondevice.availability()`. Now that it's registered, auto will select it.)

- [ ] **Step 2: Run tests + build**

Run: `export PATH=/home/amali/.nvm/versions/node/v22.22.0/bin:$PATH && npm test && npm run build`
Expected: green; both dist bundles build.

- [ ] **Step 3: Commit**

```bash
git add src/engines/index.js
git commit -m "feat(engines): register on-device and make auto select it when available"
```

### Task 3.4: Verify on-device default in real Chrome (user-assisted)

On-device cannot be exercised over file://; verify by loading the real built extension.

- [ ] **Step 1:** `npm run build`, then load `dist/chrome/` unpacked in Chrome (`chrome://extensions` → Load unpacked).
- [ ] **Step 2:** With no engine pinned (auto) and on-device `available`, open the popup, type a rough sentence, Improve. Confirm it streams a good rewrite **with no API key set** (proving the on-device engine, not OpenRouter).
- [ ] **Step 3:** Open the inline panel on a page (focus a textarea), Improve — confirm it streams via the SW→on-device path with no key.
- [ ] **Step 4:** Confirm the date/number preservation improved vs the raw POC (the new prompt clause). Note any quality issues.
- [ ] **Step 5:** Record outcome in the POC results note; if good, this milestone (free on-device default) is shippable.

---

## Phases 4-6 (next plan, after this milestone)

Outlined here for continuity; detailed in a follow-up plan once Phases 2-3 ship.

- **Phase 4 — Groq cloud-free engine:** add `GROQ_BASE` + `GROQ_DEFAULT_MODEL` to constants; `groqEngine = makeCloudEngine({ id:"groq", label:"Groq · free", baseUrl: GROQ_BASE, keyName:"groqApiKey", resolveModel: () => ({ model: GROQ_DEFAULT_MODEL }) })`; register it; add `groqApiKey` to storage + migration watched keys; a guided "get a free Groq key" onboarding step (key field + link in settings/first-run).
- **Phase 5 — Selection + first-run + transparency UI:** an engine selector in popup/options (On-device · free / Groq · free / OpenRouter); first-run detection that defaults to on-device when available else prompts the Groq guided flow; the popup/panel header shows the active engine label (extend the existing model-chip / panel trigger).
- **Phase 6 — Cross-engine fallback + error recovery:** if the active engine errors, fall back engine-aware (on-device failure → groq if key → openrouter); make the panel's existing error block engine-aware ("switch engine / retry / go premium").

---

## Self-review

**Spec coverage:** This plan implements the spec's Phase 2 (engine abstraction + SW dispatch) and Phase 3 (on-device engine), plus the fact-preserving prompt mitigation from the POC results. Spec Phases 4-6 are explicitly deferred to the next plan (stated in scope) — each milestone produces working, testable software, per the skill's scope rule.

**Placeholder scan:** No TODO/TBD. Every code step shows the actual code. The Phases 4-6 section is an outline by design, not part of the executable tasks.

**Type/name consistency:** `streamImprove({ text, systemPrompt, signal, onChunk, onModel })` is the uniform engine method used by cloud.js, ondevice.js, the SW relay, and the popup. `streamImproveText({ ..., baseUrl })` is the generalized client both the openrouter engine (default base) and the future groq engine call. `resolveEngineId(...)`/`resolveActiveEngine()`/`ENGINES` are used consistently across index.js, the SW, the popup, and the tests. `availability()` returns the same vocabulary (`ready`/`downloadable`/`needs-setup`/`unsupported`) for all engines.

**Scope:** Single coherent milestone (engine layer + on-device default with existing OpenRouter fallback). Testable in isolation; the on-device runtime path has an explicit real-Chrome verification task since it can't run over file://.
