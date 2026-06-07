import { CUSTOM_PROMPT_PREFIX, DEFAULT_STYLE } from "./constants.js";

const SUFFIX = " IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly. Preserve all dates, numbers, names, and links exactly as written.";

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

// ── Reply Mode ────────────────────────────────────────────────────────────
// "Join the conversation": the user selects (or captures) the text they're
// replying to, optionally types a free-form instruction, and picks a tone. The
// reply comes back in the language of the instruction (or the conversation when
// there's no instruction) — no language setting needed.

const REPLY_TONE_GUIDANCE = {
  match: "Match the tone, style, and level of formality of the conversation.",
  professional: "Use a professional, polished, business-appropriate tone.",
  friendly: "Use a warm, friendly, conversational tone.",
  concise: "Keep the reply brief and to the point.",
};

// Tone chips shown in the inline reply panel.
export const REPLY_TONES = [
  { id: "match", label: "Match thread" },
  { id: "professional", label: "Professional" },
  { id: "friendly", label: "Friendly" },
  { id: "concise", label: "Concise" },
];

const REPLY_OUTPUT_RULE = " Output ONLY the reply text — no preamble, no surrounding quotes, no commentary.";

// Build the system prompt for a reply. `summarize` forces a recap-style reply;
// otherwise the optional `instruction` steers what to say and sets the reply
// language (falling back to the conversation's language when absent).
export function buildReplyPrompt({ tone = "match", instruction = "", summarize = false } = {}) {
  if (summarize) {
    return "You are helping the user reply in a conversation. Read the conversation the user provides and write a short, recap-style summary they can post as a reply: capture the key points and where things landed. " +
      "Reply in the same language as the conversation." + REPLY_OUTPUT_RULE;
  }
  const guidance = REPLY_TONE_GUIDANCE[tone] || REPLY_TONE_GUIDANCE.match;
  const trimmed = (instruction || "").trim();
  const want = trimmed
    ? `The user wants the reply to convey: ${trimmed}. Reply in the same language as that instruction.`
    : "Write a natural, appropriate reply that fits the conversation. Reply in the same language as the conversation.";
  return `You are helping the user write a reply in a conversation. ${guidance} ${want}` + REPLY_OUTPUT_RULE;
}
