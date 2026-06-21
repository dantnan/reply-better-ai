import { storage } from "../lib/storage.js";
import { resolveModelSelection } from "../lib/models-cache.js";
import { DEFAULT_MODEL, OPENROUTER_BASE, GROQ_BASE, GROQ_DEFAULT_MODEL } from "../lib/constants.js";
import { makeCloudEngine } from "./cloud.js";
import { onDeviceEngine } from "./ondevice.js";

// Premium cloud engine: the existing OpenRouter path (model picker + Auto).
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

// Cloud-free engine: Groq (the user's own free key), fast, generous per-user limit.
const groqEngine = makeCloudEngine({
  id: "groq",
  label: "Groq · free",
  baseUrl: GROQ_BASE,
  keyName: "groqApiKey",
  resolveModel: async () => ({ model: GROQ_DEFAULT_MODEL }),
  quotaKey: "groqQuota",
});

export const ENGINES = { ondevice: onDeviceEngine, groq: groqEngine, openrouter: openrouterEngine };

// Pure: pick the engine id from already-gathered inputs (unit-testable).
export function resolveEngineId({ engineSetting, onDeviceAvail, hasGroqKey, hasOpenRouterKey }) {
  if (engineSetting && engineSetting !== "auto" && engineSetting in ENGINES) return engineSetting;
  if (onDeviceAvail === "ready" || onDeviceAvail === "downloadable") return "ondevice";
  if (hasGroqKey) return "groq";
  return "openrouter";
}

// Pure: which API-key fields the settings UI should show for a chosen engine.
// Drives the contextual key field so a user who picks OpenRouter sees the
// OpenRouter field (not Groq's), and an on-device user sees none. "auto" can use
// either cloud key as a fallback, so it shows both.
export function engineKeyVisibility(engine) {
  switch (engine) {
    case "ondevice": return { groq: false, openrouter: false };
    case "groq": return { groq: true, openrouter: false };
    case "openrouter": return { groq: false, openrouter: true };
    default: return { groq: true, openrouter: true }; // auto / unknown
  }
}

// True when the on-device engine is registered and usable on this device — lets
// surfaces (e.g. the popup first-run gate) treat a no-key user as ready.
export async function isOnDeviceUsable() {
  return ENGINES.ondevice ? (await ENGINES.ondevice.availability()) !== "unsupported" : false;
}

// Active engine first, then the other usable engines as fallbacks (on-device,
// then Groq, then OpenRouter — skipping unusable ones and the active dupe). The
// caller tries each until one succeeds, so a dead free engine recovers silently.
export async function orderedEngines() {
  const active = await resolveActiveEngine();
  const { groqApiKey, apiKey } = await storage.get(["groqApiKey", "apiKey"]);
  const onDeviceAvail = await ENGINES.ondevice.availability();
  const chain = [active];
  const add = (eng, usable) => { if (usable && eng && !chain.includes(eng)) chain.push(eng); };
  add(ENGINES.ondevice, onDeviceAvail === "ready" || onDeviceAvail === "downloadable");
  add(ENGINES.groq, !!groqApiKey);
  add(ENGINES.openrouter, !!apiKey);
  return chain;
}

// Display info for the currently-active engine — for the popup/panel "running
// on: …" label. Must be resolved where the on-device global exists (popup or
// service worker), not a content script.
export async function describeActiveEngine() {
  const engine = await resolveActiveEngine();
  return { id: engine.id, label: engine.label, kind: engine.kind };
}

export async function resolveActiveEngine() {
  const { engine, groqApiKey, apiKey } = await storage.get(["engine", "groqApiKey", "apiKey"]);
  const onDeviceAvail = ENGINES.ondevice ? await ENGINES.ondevice.availability() : "unsupported";
  const id = resolveEngineId({
    engineSetting: engine,
    onDeviceAvail,
    hasGroqKey: !!groqApiKey,
    hasOpenRouterKey: !!apiKey,
  });
  return ENGINES[id] || ENGINES.openrouter;
}
