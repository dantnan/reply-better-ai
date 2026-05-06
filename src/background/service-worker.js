import browser from "../lib/browser.js";
import { storage, migrateFromSync } from "../lib/storage.js";
import { improveText } from "../lib/openrouter.js";
import { resolveSystemPrompt } from "../lib/system-prompts.js";
import { DEFAULT_MODEL, MAX_INPUT_LENGTH } from "../lib/constants.js";

browser.runtime.onInstalled.addListener(async details => {
  await migrateFromSync();
  if (details.reason === "install") {
    const existing = await storage.get(["model", "messageType"]);
    const defaults = {};
    if (!existing.model) defaults.model = DEFAULT_MODEL;
    if (!existing.messageType) defaults.messageType = "professional";
    if (Object.keys(defaults).length > 0) await storage.set(defaults);
    browser.runtime.openOptionsPage().catch(err => console.warn("openOptionsPage:", err.message));
  }
});

if (browser.runtime.onStartup) {
  browser.runtime.onStartup.addListener(() => { migrateFromSync(); });
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
        sendResponse({ error: err?.userMessage || err?.message || "Unknown error", code: err?.name });
      });
    return true;
  }
  sendResponse({ error: `Unknown action: ${message.action}` });
  return true;
});

async function handleImproveText(message) {
  const { text } = message;
  if (typeof text !== "string" || !text.trim()) return { error: "Boş metin." };
  if (text.length > MAX_INPUT_LENGTH) {
    return { error: `Metin çok uzun (max ${MAX_INPUT_LENGTH} karakter).` };
  }
  const settings = await storage.get(["apiKey", "model", "messageType", "savedPrompts"]);
  if (!settings.apiKey) return { error: "API key tanımlı değil. Ayarlardan key ekle.", code: "NoApiKey" };
  const messageType = message.messageType || settings.messageType || "professional";
  const systemPrompt = resolveSystemPrompt(messageType, settings.savedPrompts || []);
  try {
    const improvedText = await improveText({
      text,
      apiKey: settings.apiKey,
      model: settings.model || DEFAULT_MODEL,
      systemPrompt,
    });
    return { improvedText };
  } catch (err) {
    return { error: err.userMessage || err.message, code: err.name };
  }
}
