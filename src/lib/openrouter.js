import { OPENROUTER_BASE, REQUEST_TIMEOUT_MS } from "./constants.js";
import { fromResponse, NetworkError, ProviderError } from "./errors.js";
import { cleanModelOutput } from "./sanitize.js";

const REFERER = "https://github.com/dantnan/reply-better-ai";
const TITLE = "Reply Better AI";

function timeoutFetch(url, options, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function improveText({ text, apiKey, model, systemPrompt }) {
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
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });
  } catch (e) {
    throw new NetworkError(e.name === "AbortError" ? "Request timed out" : e.message);
  }
  let body = null;
  try { body = await response.json(); } catch { /* may be empty */ }
  if (!response.ok) throw fromResponse(response, body);
  const out = body?.choices?.[0]?.message?.content;
  if (typeof out !== "string") throw new ProviderError(response.status, "Empty response from model");
  return cleanModelOutput(out);
}

// Streams a rewrite token-by-token. Calls onChunk(deltaText) as content arrives
// and resolves with the full text. Used by the popup for the live "typing"
// effect; the content script / service worker still use the plain improveText.
export async function streamImproveText({ text, apiKey, model, systemPrompt, onChunk, signal }) {
  let response;
  try {
    response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": REFERER,
        "X-Title": TITLE,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
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
    onChunk?.(cleaned);
    return cleaned;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
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
      const delta = json?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        full += delta;
        onChunk?.(delta);
      }
    }
  }
  if (!full) throw new ProviderError(response.status, "Empty response from model");
  return cleanModelOutput(full);
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
