// Hand-curated shortlist surfaced under the "Popular" tab. Order matters; the
// picker preserves it. Entries that no longer exist on OpenRouter silently
// disappear (the picker shows the intersection with the live list).
//
// Verified against /api/v1/models on 2026-05-06. Refresh roughly every release;
// recommendations rotate as new flagship models ship.
//
// Note: OpenRouter uses dots in version numbers for Anthropic (claude-haiku-4.5,
// not claude-haiku-4-5). Other providers use various conventions — check the
// live API before adding.
export const POPULAR_IDS = [
  // Anthropic flagship
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-opus-4.7",
  // OpenAI flagship
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-4o",
  // Google
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  // Other top providers
  "x-ai/grok-3",
  "mistralai/mistral-large",
  // DeepSeek
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v3.2",
  // Meta / Qwen flagships
  "meta-llama/llama-4-maverick",
  "qwen/qwen3.6-max-preview",
  // Free picks worth highlighting
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-coder:free",
  "openai/gpt-oss-120b:free",
];
