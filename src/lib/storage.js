import browser from "./browser.js";

export const storage = {
  get(keys) { return browser.storage.local.get(keys); },
  set(obj) { return browser.storage.local.set(obj); },
  remove(keys) { return browser.storage.local.remove(keys); },
};

const MIGRATABLE_KEYS = [
  "apiKey", "model", "messageType", "savedPrompts", "snippets",
  "enableInlineButton", "inlineMessageType", "showTypeIndicator", "customPrompt",
];

// One-time migration from storage.sync (old) to storage.local (new, more secure for credentials).
// Safe to call repeatedly: only copies keys that don't already exist locally.
export async function migrateFromSync() {
  try {
    const [syncData, localData] = await Promise.all([
      browser.storage.sync.get(null),
      browser.storage.local.get(null),
    ]);
    const toCopy = {};
    for (const k of MIGRATABLE_KEYS) {
      if (syncData[k] !== undefined && localData[k] === undefined) {
        toCopy[k] = syncData[k];
      }
    }
    if (Object.keys(toCopy).length > 0) {
      await browser.storage.local.set(toCopy);
      await browser.storage.sync.remove(MIGRATABLE_KEYS);
      console.log("[storage] migrated from sync→local:", Object.keys(toCopy));
    }
  } catch (e) {
    console.warn("[storage] migration skipped:", e.message);
  }
}
