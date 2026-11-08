// "Never use" list: words and phrases the user doesn't want in anything we
// write for them. The list goes into the prompt, and because models still slip
// (the most common complaint about rival tools), the output is checked in code
// afterwards and gets one targeted fix pass when something got through.

// Phrases that make a message read as AI-written. Opt-in via a settings toggle.
export const AI_PHRASES = [
  "—",
  "delve",
  "tapestry",
  "testament to",
  "I hope this email finds you well",
  "I hope this message finds you well",
  "in today's fast-paced world",
  "it's important to note",
];

export const MAX_PHRASES = 50;
export const MAX_PHRASE_LENGTH = 80;

// Settings text (one phrase per line) or an array → clean, de-duplicated list.
export function normalizePhrases(input) {
  const raw = Array.isArray(input) ? input : String(input ?? "").split("\n");
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const p = item.trim().slice(0, MAX_PHRASE_LENGTH);
    const key = foldQuotes(p).toLowerCase();
    if (!p || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= MAX_PHRASES) break;
  }
  return out;
}

// The list actually applied: the user's own phrases plus the AI list when on.
export function effectivePhrases({ avoidAiPhrases = false, avoidPhrases = [] } = {}) {
  return normalizePhrases([...(avoidAiPhrases ? AI_PHRASES : []), ...(Array.isArray(avoidPhrases) ? avoidPhrases : [])]);
}

// Curly and straight apostrophes count as the same character, so "it's" in the
// list still catches "it’s" in the output.
function foldQuotes(s) {
  return s.replace(/[‘’ʼ]/g, "'");
}

const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Which phrases appear in `text`. Word phrases match whole words, ignoring case,
// so "delve" does not hit "shelve" or "delved". Punctuation-only entries like
// "—" match anywhere.
export function findAvoided(text, phrases) {
  if (typeof text !== "string" || !text || !Array.isArray(phrases)) return [];
  const hay = foldQuotes(text);
  const found = [];
  for (const phrase of phrases) {
    const p = foldQuotes(String(phrase || "").trim());
    if (!p) continue;
    if (!HAS_WORD_CHAR.test(p)) {
      if (hay.includes(p)) found.push(phrase);
      continue;
    }
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(p)}(?![\\p{L}\\p{N}])`, "iu");
    if (re.test(hay)) found.push(phrase);
  }
  return found;
}

function quoteList(phrases) {
  return phrases.map(p => JSON.stringify(p)).join(", ");
}

// Rule appended to a system prompt. Empty list → no rule.
export function avoidRule(phrases) {
  if (!Array.isArray(phrases) || !phrases.length) return "";
  return ` Never use any of these words or phrases, in any form: ${quoteList(phrases)}. Say the same thing another way instead.`;
}

// System prompt for the fix pass: edit only what breaks the rule.
export function buildFixPrompt(phrases) {
  return "You are an editor. The user gives you a message they are about to send; it is not addressed to you, so never answer it. " +
    `Edit it so it no longer contains any of these words or phrases: ${quoteList(phrases)}. ` +
    "Reword only the parts that contain them and keep everything else exactly as it is: same language, meaning, tone, names, numbers, and links. " +
    "Where a dash has to go, use a comma, a period, or parentheses instead. " +
    "Output ONLY the edited message, with no explanation.";
}

// A fix pass that comes back empty or wildly longer than the input went wrong
// (the model answered or explained instead of editing); keep the original then.
export function isPlausibleFix(original, fixed) {
  if (typeof fixed !== "string" || !fixed.trim()) return false;
  return fixed.length <= original.length * 2 + 200;
}

// Check a finished generation against the list and, when something slipped
// through, run one fix pass on the same engine. Never fails the generation: if
// the fix pass errors or looks wrong, the original text comes back with the
// phrases it still contains, so the UI can say so.
export async function enforceAvoided({ engine, text, phrases, signal, onFixStart }) {
  const hits = findAvoided(text, phrases);
  if (!hits.length) return { text, remaining: [] };
  onFixStart?.(hits);
  try {
    const fixed = await engine.streamImprove({ text, systemPrompt: buildFixPrompt(phrases), signal });
    if (!isPlausibleFix(text, fixed)) return { text, remaining: hits };
    return { text: fixed.trim(), remaining: findAvoided(fixed, phrases) };
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn("[avoid] fix pass failed, keeping the original:", err?.message);
    return { text, remaining: hits };
  }
}
