export const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
export const DEFAULT_STYLE = "improve";
export const RATE_LIMIT_MS = 1000;
export const MAX_INPUT_LENGTH = 50000;
export const MODELS_CACHE_TTL_MS = 60 * 60 * 1000;
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
export const REQUEST_TIMEOUT_MS = 60000;
export const CUSTOM_PROMPT_PREFIX = "custom_prompt_";
// Roughly two lines tall — enough to identify a "long message" composer
// (Gmail, Twitter/X, LinkedIn) and skip single-line rich inputs.
export const MIN_IMPROVE_TARGET_HEIGHT = 40;
