import { CUSTOM_PROMPT_PREFIX } from "./constants.js";

const SUFFIX = " IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly.";

export const DEFAULT_PROMPTS = {
  professional: "You are a professional editor. Improve the given message to make it more professional, polished, and business-appropriate. Fix grammar errors and enhance the expression while maintaining the original intent." + SUFFIX,
  friendly: "You are a friendly editor. Make this message warm, personable, and engaging while keeping it natural. Fix any errors but maintain a conversational tone." + SUFFIX,
  customer: "You are a customer service expert. Transform this message into a helpful, empathetic response that addresses customer needs professionally while maintaining a positive tone." + SUFFIX,
  concise: "You are a concise editor. Make this message brief, clear, and to-the-point while maintaining professionalism and all key information." + SUFFIX,
};

export const TYPE_LABELS = {
  professional: "Pro",
  friendly: "Friendly",
  customer: "Service",
  concise: "Concise",
};

export function resolveSystemPrompt(messageType, savedPrompts = []) {
  if (typeof messageType === "string" && messageType.startsWith(CUSTOM_PROMPT_PREFIX)) {
    const idx = parseInt(messageType.slice(CUSTOM_PROMPT_PREFIX.length), 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < savedPrompts.length) {
      return savedPrompts[idx].text + SUFFIX;
    }
  }
  return DEFAULT_PROMPTS[messageType] || DEFAULT_PROMPTS.professional;
}
