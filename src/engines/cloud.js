import { storage } from "../lib/storage.js";
import { streamImproveText } from "../lib/openrouter.js";
import { InvalidKeyError } from "../lib/errors.js";

// Build a cloud engine for an OpenAI-compatible provider. `resolveModel()` returns
// { model } or { models } for the request; `keyName` is the storage key holding
// the user's API key (read in the service worker / popup, never sent to page
// context). All cloud engines share the one streaming client in openrouter.js.
export function makeCloudEngine({ id, label, baseUrl, keyName, resolveModel, quotaKey }) {
  return {
    id,
    label,
    kind: "cloud",

    async availability() {
      const data = await storage.get([keyName]);
      return data[keyName] ? "ready" : "needs-setup";
    },

    async streamImprove({ text, systemPrompt, signal, onChunk, onModel }) {
      const data = await storage.get([keyName]);
      const apiKey = data[keyName];
      if (!apiKey) throw new InvalidKeyError("No API key set");
      const { model, models } = await resolveModel();
      // Cache the provider's reported remaining quota (from response headers, e.g.
      // Groq) so settings can show "≈N left" without spending a request to check.
      const onQuota = quotaKey
        ? (q => { storage.set({ [quotaKey]: { ...q, at: Date.now() } }).catch(e => console.debug(`[${id}] quota cache write failed:`, e?.message)); })
        : undefined;
      return streamImproveText({ text, apiKey, model, models, systemPrompt, baseUrl, signal, onChunk, onModel, onQuota });
    },
  };
}
