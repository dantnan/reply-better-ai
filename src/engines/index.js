import { storage } from "../lib/storage.js";
import { resolveModelSelection } from "../lib/models-cache.js";
import { DEFAULT_MODEL, OPENROUTER_BASE } from "../lib/constants.js";
import { makeCloudEngine } from "./cloud.js";

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

// Registry. On-device and Groq engines are added in later tasks; until then,
// resolveEngineId may name them but resolveActiveEngine falls back to openrouter.
export const ENGINES = { openrouter: openrouterEngine };

// Pure: pick the engine id from already-gathered inputs (unit-testable).
export function resolveEngineId({ engineSetting, onDeviceAvail, hasGroqKey, hasOpenRouterKey }) {
  if (engineSetting && engineSetting !== "auto" && engineSetting in ENGINES) return engineSetting;
  if (onDeviceAvail === "ready" || onDeviceAvail === "downloadable") return "ondevice";
  if (hasGroqKey) return "groq";
  return "openrouter";
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
