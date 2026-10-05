// Weaker models sometimes ignore the "output only the rewrite" instruction and
// wrap the result in chatty boilerplate. cleanModelOutput strips the few
// unambiguous wrappers — a "Here's a … version:" preamble, surrounding markdown
// rules/fences, and a trailing "Would you like …?" offer — without touching the
// real content. Conservative by design: when in doubt, leave the text alone.
const PREAMBLE = /^(sure|certainly|of course|here(?:'|’|)s|here is|here are)\b[^\n]*:\s*\n+/i;
const TRAILING_OFFER = /\n+\s*(would you like|let me know if|feel free to|hope (?:this|that) helps|happy to)\b[^\n]*$/i;

// `original` is what the user actually typed. A polite closing line is normal in
// a real message ("Let me know if you have any questions."), so stripping it as
// model chatter silently deletes the user's own sentence. When the phrase was
// already in the draft, it stays.
export function cleanModelOutput(text, original = "") {
  if (typeof text !== "string") return text;
  let out = text.trim();

  // Whole response fenced in a code block → unwrap.
  const fence = out.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence) out = fence[1].trim();

  out = out.replace(PREAMBLE, "");
  // Trailing "Would you like…?" offer first, so a markdown rule that sat just
  // above it becomes the new trailing rule and gets stripped below.
  out = out.replace(TRAILING_OFFER, match => {
    const phrase = match.trim().toLowerCase();
    const draft = String(original ?? "").toLowerCase();
    // Keep it when the user wrote it themselves.
    return draft.includes(phrase) || draft.includes(phrase.replace(/[.!?]+$/, "")) ? match : "";
  });

  // Leading / trailing markdown horizontal rules ("---" on their own line).
  out = out.replace(/^(?:---+|\*\*\*+|___+)\s*\n+/, "");
  out = out.replace(/\n+\s*(?:---+|\*\*\*+|___+)\s*$/, "");

  return out.trim();
}
