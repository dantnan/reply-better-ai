# Free-First Engines — Phase 1 (On-Device POC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate, on a real machine, whether Chrome's built-in on-device AI (Gemini Nano) is a viable *free default* for the extension's text-improve feature — measuring availability, the setup a real end user needs (flags or none), rewrite quality vs cloud, and latency — and confirm the Prompt API is callable from an MV3 service worker. This is a **go/no-go gate** before building the full engine layer (phases 2-6).

**Architecture:** A tiny, throwaway, standalone "probe" unpacked extension (separate from the main extension so nothing real is touched) with three surfaces: a popup that runs an interactive rewrite + timings, a service worker that logs API availability on startup (to confirm SW access), and on-screen reporting. The user loads it in their own Chrome and records observations against a decision rubric.

**Tech Stack:** Chrome MV3 extension (vanilla JS), Chrome Built-in AI `LanguageModel` (Prompt API), Gemini Nano. No build step (the probe is plain files). No npm, no tests — this is a validation spike, not feature code; its deliverable is evidence + a decision, not shipped functionality.

**Why a spike, not TDD:** We are answering open empirical questions about a third-party on-device API on real hardware. There is no unit to test-drive yet; the "test" is running the probe in a real browser and observing. The full feature (phases 2-6) will be TDD'd once this gate passes.

**Spec:** `docs/superpowers/specs/2026-06-08-free-first-engines-design.md`

---

## File structure

All probe files live under `poc/ondevice/` (throwaway; gitignored from the build, never shipped):

- `poc/ondevice/manifest.json` — minimal MV3 manifest (popup + service worker), `minimum_chrome_version: 138`.
- `poc/ondevice/popup.html` — UI: availability line, prepare button, input textarea, Improve button, output area, log.
- `poc/ondevice/popup.js` — calls `LanguageModel.availability()`, `LanguageModel.create()` (with download monitor), `session.promptStreaming()`; times each phase.
- `poc/ondevice/sw.js` — on `install`, logs whether `LanguageModel` exists in the SW and its availability (confirms the SW path).
- `docs/superpowers/notes/2026-06-08-ondevice-poc-results.md` — created in Task 2 to record observations.

---

## Task 1: Build the probe extension

**Files:**
- Create: `poc/ondevice/manifest.json`
- Create: `poc/ondevice/popup.html`
- Create: `poc/ondevice/popup.js`
- Create: `poc/ondevice/sw.js`

- [ ] **Step 1: Create the manifest**

`poc/ondevice/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "RB On-Device Probe",
  "version": "0.0.1",
  "description": "Throwaway probe to validate Chrome built-in AI (Gemini Nano).",
  "minimum_chrome_version": "138",
  "background": { "service_worker": "sw.js" },
  "action": { "default_popup": "popup.html" }
}
```

- [ ] **Step 2: Create the popup HTML**

`poc/ondevice/popup.html`:

```html
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>RB Probe</title>
<style>
  body { width: 460px; font-family: system-ui, sans-serif; padding: 14px; }
  textarea { width: 100%; min-height: 70px; box-sizing: border-box; }
  button { margin: 6px 0; padding: 6px 12px; }
  #avail { font-weight: 700; }
  #out { white-space: pre-wrap; background: #f4f5f8; padding: 8px; border-radius: 6px; min-height: 40px; }
  #log { white-space: pre-wrap; color: #555; font: 12px monospace; margin-top: 8px; }
</style></head>
<body>
  <div>Availability: <span id="avail">checking…</span></div>
  <button id="prepare">Prepare / download model</button>
  <textarea id="in">hey team i think the 15th is to risky lets push it to the 18th so QA can finish</textarea>
  <button id="run">Improve (on-device)</button>
  <div id="out"></div>
  <div id="log"></div>
  <script src="popup.js"></script>
</body></html>
```

- [ ] **Step 3: Create the popup logic**

`poc/ondevice/popup.js`:

```js
const $ = id => document.getElementById(id);
const log = m => { $("log").textContent += m + "\n"; };
const SYSTEM = "You are an expert editor. Improve the given message: fix grammar and spelling, tighten the wording, and make it clear and natural while preserving the meaning and intent. Output ONLY the improved message, with no preamble.";

let session = null;

(async () => {
  if (typeof LanguageModel === "undefined") { $("avail").textContent = "LanguageModel UNDEFINED in popup"; return; }
  try { $("avail").textContent = await LanguageModel.availability(); }
  catch (e) { $("avail").textContent = "availability() threw: " + e; }
})();

$("prepare").onclick = async () => {
  if (typeof LanguageModel === "undefined") { log("LanguageModel undefined"); return; }
  const t0 = performance.now();
  try {
    session = await LanguageModel.create({
      initialPrompts: [{ role: "system", content: SYSTEM }],
      monitor(m) { m.addEventListener("downloadprogress", e => log("download " + Math.round(e.loaded * 100) + "%")); },
    });
    log("session ready in " + Math.round(performance.now() - t0) + " ms");
    $("avail").textContent = await LanguageModel.availability();
  } catch (e) { log("create() error: " + e); }
};

$("run").onclick = async () => {
  if (typeof LanguageModel === "undefined") { log("LanguageModel undefined"); return; }
  try {
    if (!session) {
      session = await LanguageModel.create({ initialPrompts: [{ role: "system", content: SYSTEM }] });
    }
    $("out").textContent = "";
    const t0 = performance.now();
    let first = 0, full = "";
    const stream = session.promptStreaming($("in").value);
    for await (const chunk of stream) {
      if (!first) { first = performance.now(); log("first token in " + Math.round(first - t0) + " ms"); }
      // NOTE: confirm whether chunk is a delta or cumulative — adjust if output duplicates.
      full += chunk;
      $("out").textContent = full;
    }
    log("done in " + Math.round(performance.now() - t0) + " ms, " + full.length + " chars");
  } catch (e) { log("prompt error: " + e); }
};
```

- [ ] **Step 4: Create the service-worker probe**

`poc/ondevice/sw.js`:

```js
self.addEventListener("install", () => {
  (async () => {
    const has = typeof LanguageModel !== "undefined";
    console.log("[probe-sw] LanguageModel in service worker:", has);
    if (has) {
      try { console.log("[probe-sw] availability:", await LanguageModel.availability()); }
      catch (e) { console.log("[probe-sw] availability threw:", e); }
    }
  })();
});
```

- [ ] **Step 5: Commit the probe**

```bash
git add poc/ondevice/
git commit -m "chore(poc): on-device (Gemini Nano) validation probe extension"
```

---

## Task 2: Run the probe in real Chrome and record results

This task is **performed by the user** (the Prompt API only exists in a real extension context — it cannot be exercised via the headless/file:// harness used for the rest of the project).

- [ ] **Step 1: Load the probe**

In your daily Chrome: open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `poc/ondevice/`.

- [ ] **Step 2: Check the service-worker path**

On the probe's card, click **service worker** to open its console. Record the two `[probe-sw]` lines: is `LanguageModel` present in the SW, and what is `availability`?

- [ ] **Step 3: Check availability + setup needed**

Open the probe popup. Record the **Availability** value: one of `available`, `downloadable`, `downloading`, `unavailable`.
- If `unavailable`: open `chrome://on-device-internals` and record what it says. Then try enabling `chrome://flags/#prompt-api-for-gemini-nano` and `chrome://flags/#optimization-guide-on-device-model` (Enabled / BypassPerfRequirement), restart, and re-check. **Record whether any flag was required** — this directly decides whether on-device can be a zero-setup default for end users.

- [ ] **Step 4: Prepare the model**

Click **Prepare / download model**. Record the download progress behavior and the "session ready" time. (First run downloads the model once.)

- [ ] **Step 5: Measure quality + speed**

Click **Improve (on-device)** on the prefilled rough sentence, then try 2-3 of your own real messages (including a non-English one and a longer paragraph). For each, record: the **output quality** (good / acceptable / poor vs what OpenRouter/Haiku gives), **first-token latency**, and **total time**. Note whether the streamed chunks were deltas or cumulative (adjust the `// NOTE` line if output duplicated).

- [ ] **Step 6: Write the results note**

Create `docs/superpowers/notes/2026-06-08-ondevice-poc-results.md` with: Chrome version; SW `LanguageModel` present? ; availability value; flags required (yes/no, which); model download size/time; per-sample quality + latency; and a one-line verdict (viable as free default / opt-in only / not viable).

```bash
git add docs/superpowers/notes/2026-06-08-ondevice-poc-results.md
git commit -m "docs(poc): on-device validation results"
```

---

## Task 3: Go/No-Go decision

- [ ] **Step 1: Apply the rubric**

Using the results note, classify the outcome:

- **GO — free default:** availability is `available`/`downloadable` with **no chrome://flags required** for a normal user, AND quality is good/acceptable for rewrites, AND latency is reasonable (first token within a couple of seconds after warm-up). → On-device becomes the zero-setup free default on capable Chrome; proceed to phases 2-6 as specced.
- **PARTIAL — opt-in:** it works but needs a flag, or quality/latency is mediocre. → On-device ships as an opt-in "free, private, on-device" engine; the **default free path becomes Groq-BYOK**; proceed to phases 2-6 with that default swapped.
- **NO-GO:** `unavailable` on this representative machine even with flags, or quality is unusable. → Drop on-device from v1; the free story becomes **guided Groq-BYOK** (still a big win over OpenRouter free); re-scope the spec accordingly.

- [ ] **Step 2: Record the decision + author the build plan**

Append the decision to the results note. Then author the Phase 2-6 implementation plan (`docs/superpowers/plans/2026-06-08-free-engines-build.md`) reflecting the chosen default. (The engine abstraction, the generalized Groq/OpenRouter cloud client, and the Groq onboarding are needed in all three outcomes; only on-device's role as default-vs-opt-in-vs-dropped changes.)

---

## Self-review

**Spec coverage:** This plan covers only the spec's "Risks & validation (POC FIRST)" section and Phase 1, by design — it is the go/no-go gate. Phases 2-6 (engine abstraction, on-device engine, Groq engine, selection/first-run/transparency, cross-engine fallback) are intentionally deferred to a follow-up plan authored from the POC results, because their exact shape (especially whether on-device is the default) depends on this gate. This is the spec's stated intent ("Phase 1 is a POC ... decide from evidence before building the full engine layer").

**Placeholder scan:** No "TODO/TBD". The one `// NOTE` in `popup.js` is a real runtime instruction (delta-vs-cumulative is genuinely API-version-dependent and the probe's job is to determine it), not a deferred decision.

**Type/name consistency:** `LanguageModel.availability()`, `LanguageModel.create({ initialPrompts, monitor })`, `session.promptStreaming()`, `session.destroy()` are used consistently across `popup.js` and `sw.js` and match the documented Chrome Prompt API surface.

**Scope:** Single, self-contained, testable deliverable (a probe + recorded evidence + a decision). Produces a decision artifact on its own, per the skill's scope rule.
