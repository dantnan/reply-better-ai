import { listModels } from "./openrouter.js";
import { storage } from "./storage.js";
import { MODELS_CACHE_TTL_MS, DEFAULT_MODEL } from "./constants.js";

const CACHE_KEY = "modelsCache";

export async function getModels({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const { [CACHE_KEY]: cached } = await storage.get([CACHE_KEY]);
    if (cached?.models?.length && Date.now() - cached.cachedAt < MODELS_CACHE_TTL_MS) {
      return { models: cached.models, stale: false, source: "cache" };
    }
  }
  try {
    const models = await listModels();
    await storage.set({ [CACHE_KEY]: { models, cachedAt: Date.now() } });
    return { models, stale: false, source: "fresh" };
  } catch (error) {
    const { [CACHE_KEY]: cached } = await storage.get([CACHE_KEY]);
    if (cached?.models?.length) {
      console.warn("[models-cache] serving stale list, fetch failed:", error?.message);
      return { models: cached.models, stale: true, source: "stale", error };
    }
    throw error;
  }
}

export async function validateSelectedModel({ currentId, fallback = DEFAULT_MODEL } = {}) {
  if (!currentId) return { valid: false, fallback, reason: "missing" };
  let result;
  try {
    result = await getModels();
  } catch (error) {
    // No live list and no cache: defer the verdict so a future startup can retry,
    // rather than silently asserting the model is fine.
    console.warn("[models-cache] validation deferred — no models available:", error?.message);
    return { valid: true, deferred: true, reason: "offline" };
  }
  const exists = result.models.some(m => m.id === currentId);
  if (exists) return { valid: true };
  const fallbackExists = result.models.some(m => m.id === fallback);
  return {
    valid: false,
    fallback: fallbackExists ? fallback : (result.models[0]?.id ?? fallback),
    reason: "not-found",
    missingId: currentId,
  };
}

export function isFree(model) {
  return Number(model?.pricing?.prompt) === 0 && Number(model?.pricing?.completion) === 0;
}

export function formatPrice(model) {
  if (!model?.pricing) return "—";
  if (isFree(model)) return "Free";
  const fmt = n => {
    const num = Number(n);
    if (!Number.isFinite(num) || num === 0) return "$0";
    const perMTok = num * 1_000_000;
    return perMTok < 0.01 ? `$${perMTok.toFixed(4)}` : `$${perMTok.toFixed(2)}`;
  };
  return `${fmt(model.pricing.prompt)} / ${fmt(model.pricing.completion)} per MTok`;
}

export function formatContextLength(model) {
  // Coerce to a number: the value comes from the remote /models response, and
  // rendering it goes through innerHTML downstream — a non-numeric string here
  // would be injected as markup. Number() + isFinite guarantees a numeric out.
  const len = Number(model?.context_length || model?.top_provider?.context_length);
  if (!Number.isFinite(len) || len <= 0) return "";
  if (len >= 1_000_000) return `${(len / 1_000_000).toFixed(1)}M`;
  if (len >= 1000) return `${Math.round(len / 1000)}K`;
  return String(len);
}

export function getProvider(model) {
  const id = model?.id;
  if (!id || !id.includes("/")) return "";
  return id.split("/")[0];
}

export function uniqueProviders(models) {
  const set = new Set(models.map(getProvider).filter(Boolean));
  return [...set].sort();
}

// Display name + brand color + monogram for the provider prefix in a model id.
const PROVIDER_META = {
  anthropic: { label: "Anthropic", color: "#d97757" },
  openai: { label: "OpenAI", color: "#10a37f" },
  google: { label: "Google", color: "#4285f4" },
  "meta-llama": { label: "Meta", color: "#0866ff" },
  mistralai: { label: "Mistral", color: "#fa5310" },
  deepseek: { label: "DeepSeek", color: "#4d6bfe" },
  qwen: { label: "Qwen", color: "#6f42c1" },
  "x-ai": { label: "xAI", color: "#1a1a1a" },
  nousresearch: { label: "Nous", color: "#7a869a" },
  cohere: { label: "Cohere", color: "#39594d" },
  microsoft: { label: "Microsoft", color: "#0078d4" },
  perplexity: { label: "Perplexity", color: "#20808d" },
  nvidia: { label: "NVIDIA", color: "#76b900" },
};

export function getProviderLabel(model) {
  const key = getProvider(model);
  if (PROVIDER_META[key]) return PROVIDER_META[key].label;
  if (!key) return "";
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, " ");
}

export function getProviderColor(model) {
  const key = getProvider(model);
  return PROVIDER_META[key]?.color || "#868e96";
}

export function getProviderMonogram(model) {
  const label = getProviderLabel(model);
  return label.slice(0, 2);
}

// Per-MTok prices as numbers (USD), or null for a free/unknown model.
export function pricePerMTok(model) {
  if (!model?.pricing || isFree(model)) return null;
  const toMTok = n => {
    const num = Number(n);
    return Number.isFinite(num) ? num * 1_000_000 : null;
  };
  return { in: toMTok(model.pricing.prompt), out: toMTok(model.pricing.completion) };
}

// Compact USD string for a per-MTok number: $3, $0.25, $1.04.
export function formatUsd(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (n < 1) return `$${n.toFixed(2).replace(/0$/, "")}`;
  return n % 1 ? `$${n.toFixed(2)}` : `$${n}`;
}
