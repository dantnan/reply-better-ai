import browser from "./browser.js";

export const storage = {
  get(keys) { return browser.storage.local.get(keys); },
  set(obj) { return browser.storage.local.set(obj); },
  remove(keys) { return browser.storage.local.remove(keys); },
};

const MIGRATABLE_KEYS = [
  "apiKey", "model", "messageType", "savedPrompts", "snippets",
  "enableInlineButton", "inlineMessageType", "customPrompt",
];

// API key was stored in storage.sync; move it to local so it doesn't roam across devices.
// Each startup re-runs this; leftover sync keys from a partial run are detected and re-cleaned.
export async function migrateFromSync() {
  let syncData;
  let localData;
  try {
    [syncData, localData] = await Promise.all([
      browser.storage.sync.get(null),
      browser.storage.local.get(null),
    ]);
  } catch (e) {
    console.error("[storage] migration: could not read storage:", e);
    return;
  }

  const toCopy = {};
  for (const k of MIGRATABLE_KEYS) {
    if (syncData[k] !== undefined && localData[k] === undefined) {
      toCopy[k] = syncData[k];
    }
  }

  const leftoverInSync = MIGRATABLE_KEYS.filter(k => syncData[k] !== undefined);
  if (Object.keys(toCopy).length === 0 && leftoverInSync.length === 0) return;

  if (Object.keys(toCopy).length > 0) {
    try {
      await browser.storage.local.set(toCopy);
    } catch (e) {
      console.error("[storage] migration: local.set failed:", e);
      return;
    }
  }

  try {
    await browser.storage.sync.remove(MIGRATABLE_KEYS);
    if (Object.keys(toCopy).length > 0) {
      console.log("[storage] migrated from sync→local:", Object.keys(toCopy));
    }
  } catch (e) {
    console.error("[storage] migration: sync.remove failed (will retry next startup):", e);
  }
}
