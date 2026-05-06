import { OPENROUTER_BASE, RATE_LIMIT_MS, REQUEST_TIMEOUT_MS } from "./constants.js";
import { fromResponse, NetworkError, ProviderError, RateLimitError } from "./errors.js";
import { storage } from "./storage.js";

const REFERER = "https://github.com/dantnan/reply-better-ai";
const TITLE = "Reply Better AI";

async function rateLimitGuard() {
  const { lastCallTime } = await storage.get(["lastCallTime"]);
  const now = Date.now();
  if (lastCallTime && now - lastCallTime < RATE_LIMIT_MS) {
    throw new RateLimitError("Please wait a moment before making another request.");
  }
  await storage.set({ lastCallTime: now });
}

function timeoutFetch(url, options, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function improveText({ text, apiKey, model, systemPrompt }) {
  await rateLimitGuard();
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
  return out;
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
