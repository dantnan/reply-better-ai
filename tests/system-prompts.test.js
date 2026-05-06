import { describe, it, expect } from "vitest";
import { resolveSystemPrompt, DEFAULT_PROMPTS } from "../src/lib/system-prompts.js";

describe("resolveSystemPrompt", () => {
  it("returns the default professional prompt for unknown types", () => {
    expect(resolveSystemPrompt("totally-unknown")).toBe(DEFAULT_PROMPTS.professional);
  });

  it("returns the requested default style", () => {
    expect(resolveSystemPrompt("friendly")).toBe(DEFAULT_PROMPTS.friendly);
  });

  it("resolves a custom prompt by index", () => {
    const saved = [{ name: "polite", text: "Be extremely polite." }];
    const out = resolveSystemPrompt("custom_prompt_0", saved);
    expect(out.startsWith("Be extremely polite.")).toBe(true);
    expect(out).toContain("Just output the improved message directly.");
  });

  it("falls back to professional when custom index is out of range", () => {
    expect(resolveSystemPrompt("custom_prompt_5", [{ name: "x", text: "x" }]))
      .toBe(DEFAULT_PROMPTS.professional);
  });

  it("falls back when savedPrompts is empty", () => {
    expect(resolveSystemPrompt("custom_prompt_0", [])).toBe(DEFAULT_PROMPTS.professional);
  });
});
