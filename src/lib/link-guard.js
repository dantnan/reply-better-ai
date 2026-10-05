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

// What counts as a link. Successive reviews found shapes an earlier version did
// not know: endings outside a curated list (.ai, .zip, .store), punycode
// endings, and a host followed by "?" or "#" rather than "/". So the ending is
// no longer a list once something follows the host: any letters, or a punycode
// label, count. The short list survives only for a bare host with nothing after
// it, where it keeps "node.js" and "i.e." from being read as links.
//
// This will never match a mail client's linkifier exactly, and it is not meant
// to: the prompt fence is what stops the model obeying the page, and this only
// limits the damage when it does.
const BARE_HOST_TLDS = "com|net|org|io|co|dev|app|xyz|info|biz|link|click|site|online|shop|live|me|ru|cn|tk|top|ly|gl|gd|to|cc|sh|ws|pw|su|ai|zip|mov|page|store|vip|pro";
const CHARS = String.raw`[^\s<>()[\]{}"'\u0060]`;
const HOST = String.raw`[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?(?:\.[\p{L}\p{N}-]+)*`;
const TLD = String.raw`(?:xn--[a-z0-9-]{2,24}|\p{L}{2,24})`;
// A port, then "/", "?" or "#": each starts the part after the host, and a
// client linkifies the whole run.
const TAIL = String.raw`(?::\d{1,5})?[\/?#]` + CHARS + `*`;
const URL_RE = new RegExp(
  // explicit scheme or www, the unambiguous cases
  String.raw`\b(?:https?:\/\/|www\.)` + CHARS + `+` +
  // host + any ending + something after it
  String.raw`|\b${HOST}\.${TLD}${TAIL}` +
  // bare host, nothing after it: only the endings people get phished with
  String.raw`|\b${HOST}\.(?:${BARE_HOST_TLDS})(?::\d{1,5})?\b` +
  // bare IPv4, but only with something after it: a plain "1.2.3.4" is a version
  // number as often as a host, and clients do not linkify it on its own
  String.raw`|\b\d{1,3}(?:\.\d{1,3}){3}${TAIL}`,
  "giu",
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
