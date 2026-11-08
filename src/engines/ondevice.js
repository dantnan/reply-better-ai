import { cleanModelOutput } from "../lib/sanitize.js";
import { ProviderError } from "../lib/errors.js";
import { onDeviceOutputLanguage } from "../lib/languages.js";

// LanguageModel.availability() can hang and never settle (seen in headless
// Chrome 154). Every generation asks for it while resolving the engine, so a
// hang froze the whole extension, even with Groq picked. Give up after a short
// wait and treat it as unsupported; cache the answer briefly so a hanging API
// costs that wait once, not on every click.
export const AVAILABILITY_TIMEOUT_MS = 1500;
const AVAILABILITY_CACHE_MS = 30000;
let cached = null;   // { value, at }
let inflight = null; // a probe already waiting; concurrent callers share it

export function resetOnDeviceAvailabilityCache() { cached = null; inflight = null; }

async function probeAvailability() {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve("timeout"), AVAILABILITY_TIMEOUT_MS); });
  let value;
  try {
    const a = await Promise.race([LanguageModel.availability(), timeout]);
    if (a === "timeout") console.warn("[ondevice] availability() did not answer; treating on-device as unavailable for now");
    value = mapAvailability(a);
  } catch {
    value = "unsupported";
  } finally {
    clearTimeout(timer);
  }
  cached = { value, at: Date.now() };
  return value;
}

function mapAvailability(a) {
  if (a === "available") return "ready";
  if (a === "downloadable" || a === "downloading") return "downloadable";
  return "unsupported";
}

// Chrome built-in AI (Gemini Nano) via the Prompt API. No key, runs on-device.
// `LanguageModel` is a global in extension contexts (service worker + extension
// pages); it's absent elsewhere (Firefox, page/content context) -> "unsupported".
export const onDeviceEngine = {
  id: "ondevice",
  label: "On-device · free",
  kind: "on-device",

  async availability() {
    if (typeof LanguageModel === "undefined") return "unsupported";
    if (cached && Date.now() - cached.at < AVAILABILITY_CACHE_MS) return cached.value;
    if (!inflight) inflight = probeAvailability().finally(() => { inflight = null; });
    return inflight;
  },

  async streamImprove({ text, systemPrompt, outputLanguage, signal, onChunk }) {
    if (typeof LanguageModel === "undefined") throw new ProviderError(0, "On-device AI is unavailable");
    // Declare the output language so Chrome attests safety + optimizes quality
    // (silences the "No output language specified" warning). Gemini Nano only
    // supports [de, en, es, fr, ja]: use the "Write in" language when it is one
    // of those, otherwise "en" as before.
    const session = await LanguageModel.create({
      initialPrompts: [{ role: "system", content: systemPrompt }],
      expectedOutputs: [{ type: "text", languages: [onDeviceOutputLanguage(outputLanguage)] }],
    });
    try {
      let full = "";
      const stream = session.promptStreaming(text); // chunks are deltas (confirmed in the POC)
      for await (const chunk of stream) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        full += chunk;
        onChunk?.(chunk);
      }
      const cleaned = cleanModelOutput(full, text);
      if (!cleaned) throw new ProviderError(0, "Empty on-device response");
      return cleaned;
    } finally {
      session.destroy();
    }
  },
};
