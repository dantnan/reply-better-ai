import { describe, it, expect } from "vitest";
import { resolveSystemPrompt, STYLE_PROMPTS, STYLES, styleLabel } from "../src/lib/system-prompts.js";

describe("resolveSystemPrompt", () => {
  it("returns the default 'improve' prompt for unknown styles", () => {
    expect(resolveSystemPrompt("totally-unknown")).toBe(STYLE_PROMPTS.improve);
  });

  it("returns the requested built-in style", () => {
    expect(resolveSystemPrompt("friendly")).toBe(STYLE_PROMPTS.friendly);
    expect(resolveSystemPrompt("persuasive")).toBe(STYLE_PROMPTS.persuasive);
  });

  it("still resolves the legacy 'customer' style", () => {
    expect(resolveSystemPrompt("customer")).toBe(STYLE_PROMPTS.customer);
  });

  it("resolves a custom prompt by index", () => {
    const saved = [{ name: "polite", text: "Be extremely polite." }];
    const out = resolveSystemPrompt("custom_prompt_0", saved);
    expect(out.startsWith("Be extremely polite.")).toBe(true);
    expect(out).toContain("Just output the improved message directly.");
  });

  it("falls back to 'improve' when custom index is out of range", () => {
    expect(resolveSystemPrompt("custom_prompt_5", [{ name: "x", text: "x" }]))
      .toBe(STYLE_PROMPTS.improve);
  });

  it("falls back when savedPrompts is empty", () => {
    expect(resolveSystemPrompt("custom_prompt_0", [])).toBe(STYLE_PROMPTS.improve);
  });

  it("instructs the model to preserve dates/numbers/names", () => {
    expect(resolveSystemPrompt("improve")).toMatch(/preserve all dates, numbers, names/i);
  });
});

describe("STYLES", () => {
  it("lists the five built-in styles with Improve first", () => {
    expect(STYLES.map(s => s.id)).toEqual(["improve", "professional", "friendly", "concise", "persuasive"]);
  });
});

describe("styleLabel", () => {
  it("maps built-in ids to labels", () => {
    expect(styleLabel("improve")).toBe("Improve");
    expect(styleLabel("persuasive")).toBe("Persuasive");
  });

  it("returns the saved prompt name for custom styles", () => {
    expect(styleLabel("custom_prompt_0", [{ name: "Standup", text: "..." }])).toBe("Standup");
  });

  it("falls back to Custom for an out-of-range custom id", () => {
    expect(styleLabel("custom_prompt_9", [])).toBe("Custom");
  });
});
