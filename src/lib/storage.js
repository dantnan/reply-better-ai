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
    await browser.storage.local.set({
      migrationError: { phase: "read", message: e?.message ?? String(e), at: Date.now() },
    }).catch(() => {});
    return;
  }

  const toCopy = {};
  for (const k of MIGRATABLE_KEYS) {
    if (syncData[k] !== undefined && localData[k] === undefined) {
      toCopy[k] = syncData[k];
    }
  }

  // Detect leftover sync keys from a previous partial migration so we can re-clean.
  const leftoverInSync = MIGRATABLE_KEYS.filter(k => syncData[k] !== undefined);
  if (Object.keys(toCopy).length === 0 && leftoverInSync.length === 0) return;

  if (Object.keys(toCopy).length > 0) {
    try {
      await browser.storage.local.set(toCopy);
    } catch (e) {
      console.error("[storage] migration: local.set failed:", e);
      await browser.storage.local.set({
        migrationError: { phase: "write", message: e?.message ?? String(e), at: Date.now() },
      }).catch(() => {});
      return;
    }
  }

  // local.set succeeded (or wasn't needed) — now strip sync. If this fails the
  // credentials are stranded in sync; flag it so the next startup retries.
  try {
    await browser.storage.sync.remove(MIGRATABLE_KEYS);
    await browser.storage.local.remove(["migrationError", "migrationCleanupPending"]);
    if (Object.keys(toCopy).length > 0) {
      console.log("[storage] migrated from sync→local:", Object.keys(toCopy));
    }
  } catch (e) {
    console.error("[storage] migration: sync.remove failed (will retry next startup):", e);
    await browser.storage.local.set({
      migrationCleanupPending: { keys: leftoverInSync.length ? leftoverInSync : Object.keys(toCopy), at: Date.now() },
    }).catch(() => {});
  }
}
