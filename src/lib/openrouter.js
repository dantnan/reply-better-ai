import { OPENROUTER_BASE, REQUEST_TIMEOUT_MS } from "./constants.js";
import { fromResponse, NetworkError, ProviderError } from "./errors.js";
import { cleanModelOutput } from "./sanitize.js";

const REFERER = "https://github.com/dantnan/reply-better-ai";
const TITLE = "Reply Better AI";

// Free models run on OpenRouter's throttled, shared capacity, so they queue and
// crawl. The one lever we control is provider selection: ask OpenRouter to route
// a free model to its highest-throughput provider. There's no cost downside
// (the model is free); paid models keep the default price-balanced routing so we
// don't quietly raise the user's bill.
function routingExtras(model) {
  return typeof model === "string" && model.includes(":free")
    ? { provider: { sort: "throughput" } }
    : {};
}

function timeoutFetch(url, options, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Build the request body. With a `models` array (Auto · Fastest free) OpenRouter
// picks the fastest available and fails over automatically; with a single model
// we keep default routing (throughput only for free models, no cost downside).
function buildBody({ model, models, systemPrompt, text, stream }) {
  const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: text }];
  const streamPart = stream ? { stream: true } : {};
  const body = Array.isArray(models) && models.length
    ? { models, provider: { sort: "throughput" }, ...streamPart, messages }
    : { model, ...routingExtras(model), ...streamPart, messages };
  return JSON.stringify(body);
}

export async function improveText({ text, apiKey, model, models, systemPrompt }) {
  let response;
  try {
    response = await timeoutFetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": REFERER,
        "X-Title": TITLE,
      },
      body: buildBody({ model, models, systemPrompt, text }),
    });
  } catch (e) {
    throw new NetworkError(e.name === "AbortError" ? "Request timed out" : e.message);
  }
  let body = null;
  try { body = await response.json(); } catch { /* may be empty */ }
  if (!response.ok) throw fromResponse(response, body);
  const out = body?.choices?.[0]?.message?.content;
  if (typeof out !== "string") throw new ProviderError(response.status, "Empty response from model");
  const cleaned = cleanModelOutput(out);
  if (!cleaned) throw new ProviderError(response.status, "Empty response from model");
  return cleaned;
}

// Streams a rewrite token-by-token. Calls onChunk(deltaText) as content arrives
// and resolves with the full text. Used by the popup (direct) and by the inline
// panel via the service-worker port relay; non-streaming callers use improveText.
export async function streamImproveText({ text, apiKey, model, models, systemPrompt, onChunk, onModel, signal, baseUrl = OPENROUTER_BASE }) {
  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": REFERER,
        "X-Title": TITLE,
      },
      body: buildBody({ model, models, systemPrompt, text, stream: true }),
    });
  } catch (e) {
    throw new NetworkError(e.name === "AbortError" ? "Request aborted" : e.message);
  }

  if (!response.ok) {
    let body = null;
    try { body = await response.json(); } catch { /* may be empty */ }
    throw fromResponse(response, body);
  }
  if (!response.body) {
    // No stream support from this provider — fall back to a single read.
    const body = await response.json().catch(() => null);
    const out = body?.choices?.[0]?.message?.content;
    if (typeof out !== "string") throw new ProviderError(response.status, "Empty response from model");
    const cleaned = cleanModelOutput(out);
    if (!cleaned) throw new ProviderError(response.status, "Empty response from model");
    if (body?.model) onModel?.(body.model);
    onChunk?.(cleaned);
    return cleaned;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep the last partial line
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        let json;
        try { json = JSON.parse(data); } catch { continue; }
        if (json.model && onModel) { onModel(json.model); onModel = null; } // report which model actually answered (once)
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          onChunk?.(delta);
        }
      }
    }
  } catch (e) {
    // A mid-stream drop rejects reader.read() with a raw error; normalize it so
    // callers' typed branches (NetworkError) fire instead of a cryptic message.
    throw e.name === "AbortError" ? new NetworkError("Request aborted") : new NetworkError(e.message);
  }
  if (!full) throw new ProviderError(response.status, "Empty response from model");
  const cleaned = cleanModelOutput(full);
  if (!cleaned) throw new ProviderError(response.status, "Empty response from model");
  return cleaned;
}

// Returns a discriminated result so callers can distinguish "key is bad" from
// "we couldn't reach OpenRouter" — otherwise users blame their working key on offline.
export async function validateApiKey(apiKey) {
  let response;
  try {
    response = await timeoutFetch(`${OPENROUTER_BASE}/auth/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }, 10000);
  } catch (e) {
    return { ok: false, reason: e?.name === "AbortError" ? "timeout" : "network", error: e };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "invalid", status: response.status };
  if (!response.ok) return { ok: false, reason: "provider", status: response.status };
  return { ok: true };
}

export async function listModels() {
  let response;
  try {
    response = await timeoutFetch(`${OPENROUTER_BASE}/models`, {}, 15000);
  } catch (e) {
    throw new NetworkError(e.name === "AbortError" ? "Models fetch timed out" : e.message);
  }
  if (!response.ok) throw new ProviderError(response.status, "Failed to fetch models");
  const body = await response.json();
  return Array.isArray(body?.data) ? body.data : [];
}
