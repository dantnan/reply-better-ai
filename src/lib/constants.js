export const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
// Sentinel "model": let OpenRouter pick the fastest available free model and
// auto-fail-over to another when one errors/rate-limits (resolved to a models[]
// list at request time — see resolveModelSelection in models-cache.js).
export const AUTO_FREE_MODEL = "auto:fastest-free";
export const AUTO_FREE_MODEL_LIMIT = 6; // how many free models to hand OpenRouter for routing/failover
export const DEFAULT_STYLE = "improve";
// Which engine powers a generation. "auto" picks on-device when available, then
// a cloud free key, then OpenRouter. See src/engines/.
export const DEFAULT_ENGINE = "auto"; // "auto" | "ondevice" | "groq" | "openrouter"
export const DEFAULT_CLICK_MODE = "panel"; // inline button: "panel" | "instant"
export const RATE_LIMIT_MS = 1000;
export const MAX_INPUT_LENGTH = 50000;
export const MODELS_CACHE_TTL_MS = 60 * 60 * 1000;
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
export const REQUEST_TIMEOUT_MS = 60000;
export const CUSTOM_PROMPT_PREFIX = "custom_prompt_";
// Roughly two lines tall — enough to identify a "long message" composer
// (Gmail, Twitter/X, LinkedIn) and skip single-line rich inputs.
export const MIN_IMPROVE_TARGET_HEIGHT = 40;
