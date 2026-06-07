import browser from "../lib/browser.js";
import { storage, migrateFromSync } from "../lib/storage.js";
import { resolveSystemPrompt, buildReplyPrompt } from "../lib/system-prompts.js";
import { DEFAULT_MODEL, DEFAULT_STYLE, MAX_INPUT_LENGTH, AUTO_FREE_MODEL } from "../lib/constants.js";
import { validateSelectedModel, getModels } from "../lib/models-cache.js";
import { resolveActiveEngine } from "../engines/index.js";

// Streaming relay for the inline panel: the content script opens a port and we
// stream the rewrite back chunk by chunk. The API key never leaves the worker.
// Two modes: "improve" (rewrite the user's draft in a style) and "reply" (write
// a reply to a captured conversation in a tone, in the instruction's language).
browser.runtime.onConnect.addListener(port => {
  if (port.name !== "rb-improve-stream") return;
  // The panel disconnects the port when it closes mid-stream; abort the upstream
  // OpenRouter request so we don't keep streaming (and billing) into the void.
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  const post = m => { try { port.postMessage(m); } catch { /* port already closed */ } };
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
      const engine = await resolveActiveEngine();
      const full = await engine.streamImprove({
        text,
        systemPrompt,
        signal: controller.signal,
        onChunk: delta => post({ delta }),
        onModel: used => post({ model: used }),
      });
      post({ done: true, full, engine: engine.label });
    } catch (err) {
      if (controller.signal.aborted) return; // panel closed; nothing to report
      console.error("[stream] relay failed:", err);
      post({ error: err?.userMessage || err?.message || "Something went wrong", code: err?.name });
    }
  });
});

browser.runtime.onInstalled.addListener(async details => {
  await migrateFromSync();
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
    const engine = await resolveActiveEngine();
    const improvedText = await engine.streamImprove({ text, systemPrompt });
    return { improvedText };
  } catch (err) {
    return {
      error: err.userMessage || err.message,
      code: err.name,
      status: err.status,
      model: err.model,
    };
  }
}
