// The one place this extension asks the user for something. Kept deliberately
// quiet: a single line in the popup, shown once, and only to someone who has
// actually kept using it. Everything here is local — the counters live in
// storage.local and are never reported anywhere.

export const REVIEW_MIN_USES = 10;
export const REVIEW_MIN_AGE_MS = 3 * 24 * 60 * 60 * 1000;

const REVIEW_URLS = {
  chrome: "https://chromewebstore.google.com/detail/reply-better-ai/dpdibbijcljdjnafjnmaljphpkfojlkb/reviews",
  firefox: "https://addons.mozilla.org/en-US/firefox/addon/reply-better-ai/reviews/",
};

export function reviewUrl(browserName) {
  return REVIEW_URLS[browserName] || REVIEW_URLS.chrome;
}

// Two conditions, both required: enough real uses, and enough days since the
// install. Someone who tries it ten times in one evening is still evaluating;
// someone still using it after three days has an opinion worth asking for.
export function shouldShowReviewPrompt({
  improveCount = 0,
  reviewPromptSeen = false,
  installedAt = 0,
  now = Date.now(),
} = {}) {
  if (reviewPromptSeen) return false;
  if (improveCount < REVIEW_MIN_USES) return false;
  if (!installedAt) return false; // install date unknown yet; ask later
  return now - installedAt >= REVIEW_MIN_AGE_MS;
}
