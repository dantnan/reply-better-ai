import { describe, it, expect } from "vitest";
import { cleanModelOutput } from "../src/lib/sanitize.js";

describe("cleanModelOutput", () => {
  it("leaves a clean rewrite untouched", () => {
    const t = "Hi Jordan,\n\nThanks for the proposal. Let's talk this week.";
    expect(cleanModelOutput(t)).toBe(t);
  });

  it("strips a 'Here's a … version:' preamble", () => {
    const input = "Here's a friendlier version of your email:\n\nHi there!\n\nWelcome aboard.";
    expect(cleanModelOutput(input)).toBe("Hi there!\n\nWelcome aboard.");
  });

  it("strips surrounding markdown rules", () => {
    const input = "---\nHi there!\n\nWelcome aboard.\n---";
    expect(cleanModelOutput(input)).toBe("Hi there!\n\nWelcome aboard.");
  });

  it("strips a trailing 'Would you like …?' offer", () => {
    const input = "Hi there!\n\nWelcome aboard.\n\nWould you like me to adjust the tone or add branding?";
    expect(cleanModelOutput(input)).toBe("Hi there!\n\nWelcome aboard.");
  });

  it("unwraps a fully fenced code block", () => {
    const input = "```\nHi there!\n```";
    expect(cleanModelOutput(input)).toBe("Hi there!");
  });

  it("handles the combined chatty wrapper from a weak model", () => {
    const input = "Here's a friendly, polished version of your verification email:\n\n---\n\nHi there!\n\nEnter this verification code to continue.\n\n---\n\nWould you like me to adjust the tone further?";
    expect(cleanModelOutput(input)).toBe("Hi there!\n\nEnter this verification code to continue.");
  });

  it("does not strip legitimate content that merely contains a dash line mid-text", () => {
    const input = "Section A\n\n---\n\nSection B";
    // internal rule is preserved; only leading/trailing rules are removed
    expect(cleanModelOutput(input)).toBe(input);
  });

  it("returns non-strings unchanged", () => {
    expect(cleanModelOutput(null)).toBe(null);
    expect(cleanModelOutput(undefined)).toBe(undefined);
  });
});
