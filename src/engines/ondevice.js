import { cleanModelOutput } from "../lib/sanitize.js";
import { ProviderError } from "../lib/errors.js";

// Chrome built-in AI (Gemini Nano) via the Prompt API. No key, runs on-device.
// `LanguageModel` is a global in extension contexts (service worker + extension
// pages); it's absent elsewhere (Firefox, page/content context) -> "unsupported".
export const onDeviceEngine = {
  id: "ondevice",
  label: "On-device · free",
  kind: "on-device",

  async availability() {
    if (typeof LanguageModel === "undefined") return "unsupported";
    try {
      const a = await LanguageModel.availability();
      if (a === "available") return "ready";
      if (a === "downloadable" || a === "downloading") return "downloadable";
      return "unsupported";
    } catch {
      return "unsupported";
    }
  },

  async streamImprove({ text, systemPrompt, signal, onChunk }) {
    if (typeof LanguageModel === "undefined") throw new ProviderError(0, "On-device AI is unavailable");
    const session = await LanguageModel.create({ initialPrompts: [{ role: "system", content: systemPrompt }] });
    try {
      let full = "";
      const stream = session.promptStreaming(text); // chunks are deltas (confirmed in the POC)
      for await (const chunk of stream) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        full += chunk;
        onChunk?.(chunk);
      }
      const cleaned = cleanModelOutput(full);
      if (!cleaned) throw new ProviderError(0, "Empty on-device response");
      return cleaned;
    } finally {
      session.destroy();
    }
  },
};
