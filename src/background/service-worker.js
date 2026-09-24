import browser from "../lib/browser.js";
import { storage, migrateFromSync } from "../lib/storage.js";
import { resolveSystemPrompt, buildReplyPrompt, wrapConversation } from "../lib/system-prompts.js";
import { stripUnsolicitedUrls } from "../lib/link-guard.js";
import { VOICE_ANALYSIS_PROMPT, VOICE_MIN_CHARS, buildVoiceAnalysisInput, isEnoughVoiceSample } from "../lib/voice.js";
import { DEFAULT_MODEL, DEFAULT_STYLE, MAX_INPUT_LENGTH, AUTO_FREE_MODEL } from "../lib/constants.js";
import { validateSelectedModel, getModels } from "../lib/models-cache.js";
import { orderedEngines, describeActiveEngine } from "../engines/index.js";

// Streaming relay for the inline panel: the content script opens a port and we
// stream the rewrite back chunk by chunk. The API key never leaves the worker.
// Two modes: "improve" (rewrite the user's draft in a style) and "reply" (write
// a reply to a captured conversation in a tone, in the instruction's language).
// Local-only usage counter, read by the popup to decide whether to show the
// one-time review line. Never sent anywhere.
async function countSuccessfulRun() {
  try {
    const { improveCount = 0 } = await storage.get(["improveCount"]);
    await storage.set({ improveCount: improveCount + 1 });
  } catch (e) {
    console.debug("[usage] could not record run:", e?.message);
  }
}

browser.runtime.onConnect.addListener(port => {
  if (port.name !== "rb-improve-stream") return;
  // The panel disconnects the port when it closes mid-stream; abort the upstream
  // OpenRouter request so we don't keep streaming (and billing) into the void.
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  const post = m => {
    try { port.postMessage(m); }
    catch (e) {
      // Expected when the panel closed the port mid-stream; onDisconnect handles
      // the user side. Log only if the port still looks open (unexpected throw).
      if (port.error == null) console.warn("[stream] postMessage failed on open port:", e?.message);
    }
  };
  port.onMessage.addListener(async msg => {
    if (!msg || msg.action !== "stream") return;
    try {
      const text = typeof msg.text === "string" ? msg.text : "";
      if (!text.trim()) { post({ error: "Nothing to send yet." }); return; }
      if (text.length > MAX_INPUT_LENGTH) { post({ error: `Text is too long (max ${MAX_INPUT_LENGTH} characters).` }); return; }
      // No early API-key gate: the active engine decides. On-device needs no key;
      // a cloud engine without a key throws InvalidKeyError, surfaced below.
      const { savedPrompts } = await storage.get(["savedPrompts"]);
      const systemPrompt = msg.mode === "reply"
        ? buildReplyPrompt({ tone: msg.tone, instruction: msg.instruction, summarize: !!msg.summarize })
        : resolveSystemPrompt(msg.style || msg.messageType || DEFAULT_STYLE, savedPrompts || []);
      // Try the active engine, then fall back to other usable engines — but only
      // before any output has streamed (never double-stream a partial result).
      const engines = await orderedEngines();
      let emitted = false, lastErr = null, finished = false;
      for (const engine of engines) {
        try {
          const full = await engine.streamImprove({
            // Reply mode sends page text the user did not write, so it goes in
            // fenced. Improve mode sends the user's own draft, untouched.
            text: msg.mode === "reply" ? wrapConversation(text) : text,
            systemPrompt,
            signal: controller.signal,
            onChunk: delta => { emitted = true; post({ delta }); },
            onModel: used => post({ model: used }),
          });
          // A reply must never carry a link the conversation did not have: that
          // is how a hidden instruction turns the user's own message into a
          // phishing message. The panel renders and inserts this `full`.
          let out = full;
          if (msg.mode === "reply") {
            // Only the user's own instruction can authorise a link. The
            // conversation cannot: an attacker writes that.
            const guarded = stripUnsolicitedUrls(full, msg.instruction);
            if (guarded.removed.length) {
              console.warn(`[stream] dropped ${guarded.removed.length} link(s) not present in the conversation`);
            }
            out = guarded.text;
          }
          post({ done: true, full: out, engine: engine.label });
          countSuccessfulRun();
          finished = true;
          break;
        } catch (err) {
          lastErr = err;
          if (controller.signal.aborted || emitted) break;
        }
      }
      if (!finished && !controller.signal.aborted) {
        console.error("[stream] all engines failed:", lastErr);
        post({ error: lastErr?.userMessage || lastErr?.message || "Something went wrong", code: lastErr?.name });
      }
    } catch (err) {
      if (controller.signal.aborted) return; // panel closed; nothing to report
      console.error("[stream] relay failed:", err);
      post({ error: err?.userMessage || err?.message || "Something went wrong", code: err?.name });
    }
  });
});

browser.runtime.onInstalled.addListener(async details => {
  await migrateFromSync();
  // Existing users upgrading have no install date; treat the upgrade as the
  // start so the review line still waits a few days before appearing.
  const { installedAt } = await storage.get(["installedAt"]);
  if (!installedAt) await storage.set({ installedAt: Date.now() });
  if (details.reason === "install") {
    const existing = await storage.get(["model", "messageType"]);
    const defaults = {};
    if (!existing.model) defaults.model = DEFAULT_MODEL;
    if (!existing.messageType) defaults.messageType = DEFAULT_STYLE;
    if (Object.keys(defaults).length > 0) await storage.set(defaults);
    browser.runtime.openOptionsPage().catch(err => console.warn("openOptionsPage:", err.message));
  }
  await runStartupValidation();
});

if (browser.runtime.onStartup) {
  browser.runtime.onStartup.addListener(async () => {
    await migrateFromSync();
    await runStartupValidation();
  });
}

async function runStartupValidation() {
  let model;
  try {
    ({ model } = await storage.get(["model"]));
  } catch (err) {
    console.warn("[startup] could not read model setting:", err?.message);
    return;
  }
  // First-run / cleared storage: silently set the default. No fallback notice
  // because the user never chose anything to begin with.
  if (!model) {
    await storage.set({ model: DEFAULT_MODEL }).catch(err => console.warn("[startup] could not set default model:", err?.message));
    return;
  }
  // "Auto · Fastest free" is a sentinel, not a real model id — it's always valid
  // and resolved per-request, so skip availability validation (don't revert it).
  if (model === AUTO_FREE_MODEL) {
    await storage.remove("modelFallbackNotice").catch(() => {});
    return;
  }
  let result;
  try {
    result = await validateSelectedModel({ currentId: model });
  } catch (err) {
    console.warn("[startup] validation threw unexpectedly:", err);
    return;
  }
  if (result.valid) {
    // The saved model resolved — wipe any leftover fallback notice so the
    // popup doesn't keep re-showing the banner after the user has already
    // moved on to a working model.
    await storage.remove("modelFallbackNotice").catch(() => {});
    return;
  }
  try {
    await storage.set({
      model: result.fallback,
      modelFallbackNotice: { from: model, to: result.fallback, at: Date.now() },
    });
    console.log(`[startup] model "${model}" missing → switched to "${result.fallback}"`);
  } catch (err) {
    console.error("[startup] failed to persist fallback:", err);
  }
}

// Keyboard shortcut (Ctrl+Shift+. by default, rebindable in the browser's
// shortcut settings). Invoking a command grants activeTab for the current tab,
// which is what lets us message its content script without a broad host
// permission. The content script decides what to do with the focused field.
if (browser.commands?.onCommand) {
  browser.commands.onCommand.addListener(async command => {
    if (command !== "improve-now") return;
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await browser.tabs.sendMessage(tab.id, { action: "shortcut" });
    } catch (e) {
      // Restricted pages (the store, about:, other extensions) have no content
      // script to talk to. Nothing to recover from; don't spam the console.
      console.debug("[commands] no content script on this tab:", e?.message);
    }
  });
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    sendResponse({ error: "Invalid message" });
    return true;
  }
  if (message.action === "ping") {
    sendResponse({ status: "ok", timestamp: Date.now() });
    return true;
  }
  if (message.action === "improveText") {
    handleImproveText(message)
      .then(sendResponse)
      .catch(err => {
        console.error("[improveText] handler error:", err);
        sendResponse({
          error: err?.userMessage || err?.message || "Unknown error",
          code: err?.name,
          status: err?.status,
          model: err?.model,
        });
      });
    return true;
  }
  // The content-script panel can't fetch openrouter.ai directly (host-page CSP
  // blocks it), so it asks the worker for the model list for its in-panel switcher.
  if (message.action === "getModels") {
    getModels()
      .then(result => sendResponse({ models: result.models || [], stale: !!result.stale }))
      .catch(err => sendResponse({ error: err?.userMessage || err?.message || "Failed to load models" }));
    return true;
  }
  // The content-script panel asks which engine is active so it can show
  // "running on: …" (it can't resolve on-device availability in page context).
  if (message.action === "activeEngine") {
    describeActiveEngine()
      .then(sendResponse)
      .catch(err => {
        console.warn("[bg] describeActiveEngine failed, falling back to OpenRouter label:", err?.message);
        sendResponse({ id: "openrouter", label: "OpenRouter", kind: "cloud" });
      });
    return true;
  }
  // "Learn my voice": read the user's samples and hand back a style instruction
  // they can edit and save as a custom prompt.
  if (message.action === "analyzeVoice") {
    handleAnalyzeVoice(message)
      .then(sendResponse)
      .catch(err => {
        console.error("[analyzeVoice] handler error:", err);
        sendResponse({ error: err?.userMessage || err?.message || "Unknown error", code: err?.name });
      });
    return true;
  }
  console.warn("[bg] unknown action:", message.action);
  sendResponse({ error: `Unknown action: ${message.action}` });
  return true;
});

async function handleImproveText(message) {
  const { text } = message;
  if (typeof text !== "string" || !text.trim()) return { error: "No text to improve." };
  if (text.length > MAX_INPUT_LENGTH) {
    return { error: `Text is too long (max ${MAX_INPUT_LENGTH} characters).` };
  }
  const settings = await storage.get(["messageType", "savedPrompts"]);
  const messageType = message.messageType || settings.messageType || DEFAULT_STYLE;
  const systemPrompt = resolveSystemPrompt(messageType, settings.savedPrompts || []);
  try {
    const engines = await orderedEngines();
    let lastErr = null;
    for (const engine of engines) {
      try {
        const improvedText = await engine.streamImprove({ text, systemPrompt });
        countSuccessfulRun();
        return { improvedText };
      }
      catch (err) {
        lastErr = err;
        console.warn(`[improveText] engine "${engine.id}" failed:`, err?.name, err?.message);
      }
    }
    throw lastErr || new Error("No engine available");
  } catch (err) {
    return {
      error: err.userMessage || err.message,
      code: err.name,
      status: err.status,
      model: err.model,
    };
  }
}

async function handleAnalyzeVoice(message) {
  const samples = buildVoiceAnalysisInput(message.samples);
  if (!isEnoughVoiceSample(samples)) {
    return { error: `Paste at least ${VOICE_MIN_CHARS} characters of your own writing.` };
  }
  try {
    const engines = await orderedEngines();
    let lastErr = null;
    for (const engine of engines) {
      try {
        const style = await engine.streamImprove({ text: samples, systemPrompt: VOICE_ANALYSIS_PROMPT });
        return { style: (style || "").trim(), engine: engine.label };
      } catch (err) {
        lastErr = err;
        console.warn(`[analyzeVoice] engine "${engine.id}" failed:`, err?.name, err?.message);
      }
    }
    throw lastErr || new Error("No engine available");
  } catch (err) {
    return { error: err.userMessage || err.message, code: err.name };
  }
}
