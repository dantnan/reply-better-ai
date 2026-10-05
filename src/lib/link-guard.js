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
// not know, each one a difference between this pattern and what a client will
// turn into a clickable link: endings outside a curated list (.ai, .zip), a
// punycode ending, a host followed by "?" or "#", a non-ASCII host, a label
// separator that is not an ASCII dot, and invisible characters inside a host.
//
// So: the ending is not a list once something follows the host, the separator
// is any character IDNA maps to a dot, hosts may be any script, and the
// characters IDNA throws away are allowed inside a host so a name wearing them
// still matches. The short list survives only for a bare host with nothing
// after it, where it keeps "node.js" and "i.e." from reading as links.
//
// This will never match a mail client's linkifier exactly, and it is not meant
// to: the prompt fence is what stops the model obeying the page, and this only
// limits the damage when it does.
const BARE_HOST_TLDS = "com|net|org|io|co|dev|app|xyz|info|biz|link|click|site|online|shop|live|me|ru|cn|tk|top|ly|gl|gd|to|cc|sh|ws|pw|su|ai|zip|mov|page|store|vip|pro";
const CHARS = String.raw`[^\s<>()[\]{}"']`;
// A browser reads each of these as the label separator, so "evil。com/x"
// resolves exactly like "evil.com/x".
const DOT = String.raw`[.。．｡]`;
// Characters IDNA strips before resolving a host. Left in, they are invisible
// to the reader and hide the real domain from a naive pattern.
const INV = String.raw`­​-‏⁠﻿`;
const HOSTCH = String.raw`[\p{L}\p{N}` + INV + `]`;
const HOST = HOSTCH + String.raw`(?:[\p{L}\p{N}\-` + INV + String.raw`]*` + HOSTCH + `)?` +
  String.raw`(?:${DOT}[\p{L}\p{N}\-` + INV + String.raw`]+)*`;
const TLD = String.raw`(?:xn--[a-z0-9\-]{2,24}|[\p{L}` + INV + String.raw`]{2,24})`;
// A port, then "/", "?" or "#": each starts the part after the host, and a
// client linkifies the whole run.
const TAIL = String.raw`(?::\d{1,5})?[\/?#]` + CHARS + `*`;
// \b is ASCII-only, so it finds no boundary before a Cyrillic or Greek host.
// Look behind for anything that could belong to a host instead.
const START = String.raw`(?<![\p{L}\p{N}@` + INV + String.raw`]|${DOT})`;
const URL_RE = new RegExp(
  // explicit scheme or www, the unambiguous cases
  START + String.raw`(?:https?:\/\/|www${DOT})` + CHARS + `+` +
  // host + any ending + something after it
  `|` + START + String.raw`${HOST}${DOT}${TLD}${TAIL}` +
  // bare host, nothing after it: only the endings people get phished with
  `|` + START + String.raw`${HOST}${DOT}(?:${BARE_HOST_TLDS})(?::\d{1,5})?\b` +
  // bare IPv4, but only with something after it: a plain "1.2.3.4" is a version
  // number as often as a host, and clients do not linkify it on its own
  `|` + START + String.raw`\d{1,3}(?:${DOT}\d{1,3}){3}${TAIL}`,
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
