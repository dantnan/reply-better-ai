import { CUSTOM_PROMPT_PREFIX, DEFAULT_STYLE } from "./constants.js";

const SUFFIX = " IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly.";

// Built-in writing styles. "improve" is the general default; the rest are
// intent-specific. Custom prompts surface alongside these as styles too.
export const STYLE_PROMPTS = {
  improve: "You are an expert editor. Improve the given message: fix grammar and spelling, tighten the wording, and make it clear and natural — while preserving the original meaning, tone, and intent." + SUFFIX,
  professional: "You are a professional editor. Improve the given message to make it more professional, polished, and business-appropriate. Fix grammar errors and enhance the expression while maintaining the original intent." + SUFFIX,
  friendly: "You are a friendly editor. Make this message warm, personable, and engaging while keeping it natural. Fix any errors but maintain a conversational tone." + SUFFIX,
  concise: "You are a concise editor. Make this message brief, clear, and to-the-point while maintaining professionalism and all key information." + SUFFIX,
  persuasive: "You are a persuasive writing expert. Rewrite the message to be more compelling and convincing while staying professional, respectful, and truthful." + SUFFIX,
  // Legacy key kept so settings stored before the v1.3 rename still resolve.
  customer: "You are a customer service expert. Transform this message into a helpful, empathetic response that addresses customer needs professionally while maintaining a positive tone." + SUFFIX,
};

// Backwards-compatible alias for older imports/tests.
export const DEFAULT_PROMPTS = STYLE_PROMPTS;

// Ordered list shown in the Style dropdowns (popup + inline default).
export const STYLES = [
  { id: "improve", label: "Improve" },
  { id: "professional", label: "Professional" },
  { id: "friendly", label: "Friendly" },
  { id: "concise", label: "Concise" },
  { id: "persuasive", label: "Persuasive" },
];

// id → short label, used for the inline button tooltip / type indicator.
export const STYLE_LABELS = {
  improve: "Improve",
  professional: "Professional",
  friendly: "Friendly",
  concise: "Concise",
  persuasive: "Persuasive",
  customer: "Service",
};

export function styleLabel(styleId, savedPrompts = []) {
  if (typeof styleId === "string" && styleId.startsWith(CUSTOM_PROMPT_PREFIX)) {
    const idx = parseInt(styleId.slice(CUSTOM_PROMPT_PREFIX.length), 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < savedPrompts.length) {
      return savedPrompts[idx].name;
    }
    return "Custom";
  }
  return STYLE_LABELS[styleId] || STYLE_LABELS[DEFAULT_STYLE];
}

export function resolveSystemPrompt(styleId, savedPrompts = []) {
  if (typeof styleId === "string" && styleId.startsWith(CUSTOM_PROMPT_PREFIX)) {
    const idx = parseInt(styleId.slice(CUSTOM_PROMPT_PREFIX.length), 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < savedPrompts.length) {
      return savedPrompts[idx].text + SUFFIX;
    }
  }
  return STYLE_PROMPTS[styleId] || STYLE_PROMPTS[DEFAULT_STYLE];
}
