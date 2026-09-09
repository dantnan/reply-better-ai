// "Learn my voice": the user pastes a few things they wrote, a model reads them
// and writes a style instruction, and that instruction is saved as a normal
// custom prompt. Nothing magic — the result is plain editable text the user can
// read and change, and with the on-device or local engine the samples never
// leave the machine.

export const VOICE_PROMPT_NAME = "My voice";
export const VOICE_MIN_CHARS = 200;
// Enough for several long emails; keeps the analysis request well inside every
// engine's context, including on-device.
export const VOICE_MAX_CHARS = 12000;

export const VOICE_ANALYSIS_PROMPT = [
  "You are analysing how one person writes so that another model can rewrite text in their voice.",
  "",
  "Read the samples and write a single instruction paragraph describing their style: sentence length and rhythm, level of formality, words and phrases they favour or avoid, punctuation habits, how they open and close messages, and anything else distinctive.",
  "",
  "Rules:",
  "- Start with: Rewrite the message in the user's own voice:",
  "- Describe style only. Never mention the topics, names, or facts in the samples.",
  "- Do not quote the samples.",
  "- Output only the instruction. No preamble, no explanation, no markdown.",
].join("\n");

export function isEnoughVoiceSample(text) {
  return typeof text === "string" && text.trim().length >= VOICE_MIN_CHARS;
}

// Long pastes get truncated rather than rejected: the tail of a sample set adds
// little, and a hard error here would just make the user trim it by hand.
export function buildVoiceAnalysisInput(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  return trimmed.length > VOICE_MAX_CHARS ? trimmed.slice(0, VOICE_MAX_CHARS) : trimmed;
}

// Re-running the analysis replaces the existing entry instead of piling up
// "My voice", "My voice 2" — there is only ever one of these.
export function upsertVoicePrompt(savedPrompts, text) {
  const list = Array.isArray(savedPrompts) ? savedPrompts.slice() : [];
  const entry = { name: VOICE_PROMPT_NAME, text };
  const i = list.findIndex(p => p?.name === VOICE_PROMPT_NAME);
  if (i >= 0) list[i] = entry; else list.push(entry);
  return list;
}
