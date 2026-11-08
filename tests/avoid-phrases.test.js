import { describe, it, expect, vi } from "vitest";
import {
  AI_PHRASES, MAX_PHRASES, MAX_PHRASE_LENGTH, normalizePhrases, effectivePhrases,
  findAvoided, avoidRule, buildFixPrompt, isPlausibleFix, enforceAvoided,
} from "../src/lib/avoid-phrases.js";

describe("normalizePhrases", () => {
  it("splits settings text by line, trims, drops blanks and duplicates", () => {
    expect(normalizePhrases("  synergy \n\nSynergy\ncircle back\n")).toEqual(["synergy", "circle back"]);
  });

  it("treats curly and straight apostrophes as the same phrase", () => {
    expect(normalizePhrases(["it's fine", "it’s fine"])).toEqual(["it's fine"]);
  });

  it("caps the list and each phrase", () => {
    const many = Array.from({ length: MAX_PHRASES + 10 }, (_, i) => `word${i}`);
    expect(normalizePhrases(many)).toHaveLength(MAX_PHRASES);
    expect(normalizePhrases(["x".repeat(500)])[0]).toHaveLength(MAX_PHRASE_LENGTH);
  });

  it("ignores non-string entries", () => {
    expect(normalizePhrases(["ok", 5, null, { a: 1 }])).toEqual(["ok"]);
  });
});

describe("effectivePhrases", () => {
  it("is empty by default", () => {
    expect(effectivePhrases()).toEqual([]);
  });

  it("adds the AI list only when the toggle is on", () => {
    expect(effectivePhrases({ avoidAiPhrases: true })).toEqual(AI_PHRASES);
    expect(effectivePhrases({ avoidPhrases: ["synergy"] })).toEqual(["synergy"]);
  });

  it("merges without duplicates", () => {
    expect(effectivePhrases({ avoidAiPhrases: true, avoidPhrases: ["DELVE", "synergy"] }))
      .toEqual([...AI_PHRASES, "synergy"]);
  });
});

describe("findAvoided", () => {
  it("matches whole words, ignoring case", () => {
    expect(findAvoided("Let's Delve into it.", ["delve"])).toEqual(["delve"]);
    expect(findAvoided("Please shelve this.", ["delve"])).toEqual([]);
    expect(findAvoided("We delved into it.", ["delve"])).toEqual([]);
  });

  it("matches multi-word phrases across curly apostrophes", () => {
    expect(findAvoided("It’s important to note that…", ["it's important to note"])).toEqual(["it's important to note"]);
  });

  it("matches punctuation-only entries anywhere", () => {
    expect(findAvoided("Fast—and cheap.", ["—"])).toEqual(["—"]);
    expect(findAvoided("Fast - and cheap.", ["—"])).toEqual([]);
  });

  it("respects word boundaries outside ASCII", () => {
    expect(findAvoided("Merhaba, görüşürüz.", ["görüş"])).toEqual([]);
    expect(findAvoided("Bir görüş: evet.", ["görüş"])).toEqual(["görüş"]);
  });

  it("treats regex characters in phrases literally", () => {
    expect(findAvoided("Costs $5 (approx).", ["(approx)"])).toEqual(["(approx)"]);
    expect(findAvoided("a+b", ["a.b"])).toEqual([]);
  });

  it("handles empty input", () => {
    expect(findAvoided("", ["x"])).toEqual([]);
    expect(findAvoided("text", [])).toEqual([]);
    expect(findAvoided(null, ["x"])).toEqual([]);
  });
});

describe("avoidRule / buildFixPrompt", () => {
  it("adds nothing for an empty list", () => {
    expect(avoidRule([])).toBe("");
    expect(avoidRule(undefined)).toBe("");
  });

  it("quotes every phrase", () => {
    const rule = avoidRule(["delve", 'say "hi"']);
    expect(rule).toContain('"delve"');
    expect(rule).toContain('"say \\"hi\\""');
  });

  it("fix prompt names the phrases and forbids answering", () => {
    const p = buildFixPrompt(["delve"]);
    expect(p).toContain('"delve"');
    expect(p).toMatch(/never answer it/i);
    expect(p).toMatch(/Output ONLY the edited message/);
  });
});

describe("isPlausibleFix", () => {
  it("rejects empty or runaway output", () => {
    expect(isPlausibleFix("short text", "")).toBe(false);
    expect(isPlausibleFix("short text", "x".repeat(1000))).toBe(false);
    expect(isPlausibleFix("short text", "a short text")).toBe(true);
  });
});

describe("enforceAvoided", () => {
  const engineReturning = out => ({ streamImprove: vi.fn().mockResolvedValue(out) });

  it("does nothing when the text is clean", async () => {
    const engine = engineReturning("unused");
    const res = await enforceAvoided({ engine, text: "All good.", phrases: ["delve"] });
    expect(res).toEqual({ text: "All good.", remaining: [] });
    expect(engine.streamImprove).not.toHaveBeenCalled();
  });

  it("runs one fix pass and reports what is left", async () => {
    const engine = engineReturning("Let's look into it — today.");
    const onFixStart = vi.fn();
    const res = await enforceAvoided({ engine, text: "Let's delve into it — today.", phrases: ["delve", "—"], onFixStart });
    expect(onFixStart).toHaveBeenCalledWith(["delve", "—"]);
    expect(engine.streamImprove).toHaveBeenCalledTimes(1);
    expect(engine.streamImprove.mock.calls[0][0].systemPrompt).toContain('"delve"');
    expect(res).toEqual({ text: "Let's look into it — today.", remaining: ["—"] });
  });

  it("keeps the original when the fix pass fails", async () => {
    const engine = { streamImprove: vi.fn().mockRejectedValue(new Error("rate limit")) };
    const res = await enforceAvoided({ engine, text: "We delve.", phrases: ["delve"] });
    expect(res).toEqual({ text: "We delve.", remaining: ["delve"] });
  });

  it("keeps the original when the fix looks wrong", async () => {
    const engine = engineReturning("");
    const res = await enforceAvoided({ engine, text: "We delve.", phrases: ["delve"] });
    expect(res).toEqual({ text: "We delve.", remaining: ["delve"] });
  });

  it("rethrows when the run was aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const engine = { streamImprove: vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")) };
    await expect(enforceAvoided({ engine, text: "We delve.", phrases: ["delve"], signal: controller.signal }))
      .rejects.toThrow("Aborted");
  });
});
