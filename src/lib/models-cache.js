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
  const len = model?.context_length || model?.top_provider?.context_length;
  if (!len) return "";
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
