import { storage } from "../lib/storage.js";
import { streamImproveText } from "../lib/openrouter.js";
import { NetworkError, OpenRouterError } from "../lib/errors.js";

// Local engine: a user-run, OpenAI-compatible server (Ollama, LM Studio,
// llama.cpp, vLLM…). No API key. Unlike the cloud engines, "available" means a
// base URL is configured — NOT that the server is reachable. Pinging here would
// be wrong: availability() runs on hot paths (resolveActiveEngine on every
// popup open / stream request), so a localhost round-trip — or a full timeout
// when the server is down — would tax every generation, including for users not
// on Local. Reachability is therefore checked lazily: as a stream-time error,
// and via listLocalModels() on the options surface (user-initiated, off the hot
// path). Explicit selection is honored regardless; a dead server surfaces when
// the request is actually made.

const MODELS_TIMEOUT_MS = 8000;

// GET {baseUrl}/models — the OpenAI-compatible model list, identical shape for
// Ollama and LM Studio ({ data: [{ id }, …] }). Resolves to the (possibly
// empty) array when the server is reachable; rejects with NetworkError when it
// can't be reached so the options UI can tell "no models" from "no server".
export async function listLocalModels(baseUrl) {
  if (!baseUrl) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${baseUrl}/models`, { signal: controller.signal });
  } catch (e) {
    throw new NetworkError(e.name === "AbortError" ? "Timed out reaching the local server" : e.message);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new NetworkError(`Local server responded ${response.status}`);
  const body = await response.json().catch(() => null);
  return Array.isArray(body?.data) ? body.data : [];
}

export function makeLocalEngine() {
  return {
    id: "local",
    label: "Local (OpenAI-compatible)",
    kind: "local",

    // Pure storage read — see the module note. No network here, by design.
    async availability() {
      const { localBaseUrl } = await storage.get(["localBaseUrl"]);
      return localBaseUrl ? "ready" : "needs-setup";
    },

    async streamImprove({ text, systemPrompt, signal, onChunk, onModel }) {
      const { localBaseUrl, localModel } = await storage.get(["localBaseUrl", "localModel"]);
      // OpenRouterError's userMessage is its message, so these reach the user verbatim.
      if (!localBaseUrl) throw new OpenRouterError("Set your local server URL in settings first.");
      if (!localModel) throw new OpenRouterError("Pick a local model in settings first.");
      try {
        return await streamImproveText({
          text, systemPrompt, signal, onChunk, onModel,
          model: localModel, baseUrl: localBaseUrl, // no apiKey -> Authorization header omitted
        });
      } catch (e) {
        // The shared client's NetworkError.userMessage is a generic cloud string;
        // give local users the actionable version (server down / CORS not enabled).
        if (e instanceof NetworkError) {
          throw new OpenRouterError(`Couldn't reach your local server at ${localBaseUrl}. Is it running? On Firefox/LM Studio you may also need to enable CORS — see the setup guide.`);
        }
        throw e;
      }
    },
  };
}
