import { storage } from "../lib/storage.js";
import { resolveModelSelection } from "../lib/models-cache.js";
import { DEFAULT_MODEL, OPENROUTER_BASE } from "../lib/constants.js";
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

// Registry. The Groq cloud-free engine is added in a later task; until then,
// resolveEngineId may name "groq" but resolveActiveEngine falls back to openrouter.
export const ENGINES = { ondevice: onDeviceEngine, openrouter: openrouterEngine };

// Pure: pick the engine id from already-gathered inputs (unit-testable).
export function resolveEngineId({ engineSetting, onDeviceAvail, hasGroqKey, hasOpenRouterKey }) {
  if (engineSetting && engineSetting !== "auto" && engineSetting in ENGINES) return engineSetting;
  if (onDeviceAvail === "ready" || onDeviceAvail === "downloadable") return "ondevice";
  if (hasGroqKey) return "groq";
  return "openrouter";
}

// True when the on-device engine is registered and usable on this device — lets
// surfaces (e.g. the popup first-run gate) treat a no-key user as ready.
export async function isOnDeviceUsable() {
  return ENGINES.ondevice ? (await ENGINES.ondevice.availability()) !== "unsupported" : false;
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
