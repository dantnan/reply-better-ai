import { describe, it, expect } from "vitest";
import {
  shouldShowReviewPrompt, reviewUrl, REVIEW_MIN_USES, REVIEW_MIN_AGE_MS,
} from "../src/lib/review-prompt.js";

const NOW = 1_800_000_000_000;
const old = NOW - REVIEW_MIN_AGE_MS - 1;

describe("shouldShowReviewPrompt", () => {
  it("shows once both thresholds are met", () => {
    expect(shouldShowReviewPrompt({ improveCount: REVIEW_MIN_USES, installedAt: old, now: NOW })).toBe(true);
  });

  it("stays hidden until the extension has been used enough", () => {
    expect(shouldShowReviewPrompt({ improveCount: REVIEW_MIN_USES - 1, installedAt: old, now: NOW })).toBe(false);
  });

  it("stays hidden for a burst of uses on a fresh install", () => {
    expect(shouldShowReviewPrompt({ improveCount: 50, installedAt: NOW - 1000, now: NOW })).toBe(false);
  });

  it("never comes back once dismissed or acted on", () => {
    expect(shouldShowReviewPrompt({ improveCount: 999, installedAt: old, reviewPromptSeen: true, now: NOW })).toBe(false);
  });

  it("waits when the install date is unknown", () => {
    expect(shouldShowReviewPrompt({ improveCount: 999, installedAt: 0, now: NOW })).toBe(false);
  });

  it("defaults to hidden with no state at all", () => {
    expect(shouldShowReviewPrompt()).toBe(false);
    expect(shouldShowReviewPrompt({})).toBe(false);
  });
});

describe("reviewUrl", () => {
  it("points at the right store per browser", () => {
    expect(reviewUrl("firefox")).toContain("addons.mozilla.org");
    expect(reviewUrl("chrome")).toContain("chromewebstore.google.com");
  });
  it("falls back to the Chrome listing for anything unknown", () => {
    expect(reviewUrl(undefined)).toContain("chromewebstore.google.com");
    expect(reviewUrl("safari")).toContain("chromewebstore.google.com");
  });
});
