// Last line of defence for reply mode.
//
// Prompt wording stops the strong models from obeying instructions hidden in
// the page, but evals showed a 70B model still following them about 4 times in
// 10 (evals/tests/injection.yaml). The damage that actually matters is a link:
// the user sends their own message and it carries an attacker's URL.
//
// The test cannot be "was this link in the conversation": the attacker writes
// the conversation, so that would whitelist exactly the link we are trying to
// stop. A reply the user composes only needs links the user asked for, so the
// rule is the other way round: a URL survives only if it appears in the user's
// own instruction. Everything else is dropped.
//
// This runs on the finished reply, in the service worker, so the content script
// never sees an unfiltered link it could insert.

// http(s) URLs and bare www. hosts. Deliberately not matching bare domains:
// "see you at 9.30" and "node.js" would become false positives, and the attack
// needs a clickable link anyway.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"'`]+/gi;

// Trailing punctuation belongs to the sentence, not the link.
function trimUrl(u) {
  return u.replace(/[.,;:!?)\]}>'"]+$/, "");
}

// Compare on host plus path, lowercased, so a link the model reformatted
// (adding a scheme, dropping a trailing slash, changing case) still counts as
// the same link the conversation contained.
function normalize(url) {
  return trimUrl(url)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export function extractUrls(text) {
  return (String(text ?? "").match(URL_RE) || []).map(trimUrl);
}

// Returns the reply with unsolicited links removed, plus what was removed.
// `sources` is only what the user themselves wrote, normally their instruction.
export function stripUnsolicitedUrls(reply, ...sources) {
  const text = String(reply ?? "");
  const known = new Set(sources.flatMap(s => extractUrls(s).map(normalize)));
  const removed = [];

  const cleaned = text.replace(URL_RE, match => {
    const url = trimUrl(match);
    if (known.has(normalize(url))) return match;
    removed.push(url);
    // Keep any trailing punctuation the regex swallowed, so the sentence still
    // reads as a sentence with the link taken out.
    return match.slice(url.length);
  });

  if (removed.length === 0) return { text, removed };
  // Removing a link mid-sentence leaves double spaces and orphaned brackets.
  const tidied = cleaned
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]+$/gm, "");
  return { text: tidied, removed };
}
