// Weaker models sometimes ignore the "output only the rewrite" instruction and
// wrap the result in chatty boilerplate. cleanModelOutput strips the few
// unambiguous wrappers — a "Here's a … version:" preamble, surrounding markdown
// rules/fences, and a trailing "Would you like …?" offer — without touching the
// real content. Conservative by design: when in doubt, leave the text alone.
const PREAMBLE = /^(sure|certainly|of course|here(?:'|’|)s|here is|here are)\b[^\n]*:\s*\n+/i;
const TRAILING_OFFER = /\n+\s*(would you like|let me know if|feel free to|hope (?:this|that) helps|happy to)\b[^\n]*$/i;

export function cleanModelOutput(text) {
  if (typeof text !== "string") return text;
  let out = text.trim();

  // Whole response fenced in a code block → unwrap.
  const fence = out.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence) out = fence[1].trim();

  out = out.replace(PREAMBLE, "");
  // Trailing "Would you like…?" offer first, so a markdown rule that sat just
  // above it becomes the new trailing rule and gets stripped below.
  out = out.replace(TRAILING_OFFER, "");

  // Leading / trailing markdown horizontal rules ("---" on their own line).
  out = out.replace(/^(?:---+|\*\*\*+|___+)\s*\n+/, "");
  out = out.replace(/\n+\s*(?:---+|\*\*\*+|___+)\s*$/, "");

  return out.trim();
}
