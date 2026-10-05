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

// http(s) URLs, bare www. hosts, and bare domains on a TLD people actually get
// phished with. Mail and chat clients auto-link "evil-login.com/verify", so
// leaving those out left the hole open. The TLD list keeps "node.js" and
// "see you at 9.30" from matching.
// Includes the short TLDs the common shorteners use (bit.ly, goo.gl, t.co),
// since a shortened link is the easiest way to hide where it really goes.
const LINKED_TLDS = "com|net|org|io|co|dev|app|xyz|info|biz|link|click|site|online|shop|live|me|ru|cn|tk|top|ly|gl|gd|to|cc|sh|ws|pw|su";
const URL_RE = new RegExp(
  String.raw`\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"'\`]+` +
  String.raw`|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:${LINKED_TLDS})\b(?:\/[^\s<>()[\]{}"'\`]*)?` +
  // A bare IPv4 with a path: "1.2.3.4/verify" carries no TLD, so the rule above
  // never saw it. The path is required, so version numbers stay untouched.
  String.raw`|\b\d{1,3}(?:\.\d{1,3}){3}\/[^\s<>()[\]{}"'\`]*`,
  "gi",
);

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
