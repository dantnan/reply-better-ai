import { describe, it, expect } from "vitest";
import {
  isEnoughVoiceSample, buildVoiceAnalysisInput, upsertVoicePrompt,
  VOICE_PROMPT_NAME, VOICE_MIN_CHARS, VOICE_MAX_CHARS, VOICE_ANALYSIS_PROMPT,
} from "../src/lib/voice.js";

describe("isEnoughVoiceSample", () => {
  it("rejects samples that are too short to describe a style", () => {
    expect(isEnoughVoiceSample("hi")).toBe(false);
    expect(isEnoughVoiceSample("  ".repeat(500))).toBe(false);
    expect(isEnoughVoiceSample(undefined)).toBe(false);
  });
  it("accepts a real paste", () => {
    expect(isEnoughVoiceSample("a".repeat(VOICE_MIN_CHARS))).toBe(true);
  });
});

describe("buildVoiceAnalysisInput", () => {
  it("trims surrounding whitespace", () => {
    expect(buildVoiceAnalysisInput("  hello  ")).toBe("hello");
  });
  it("truncates rather than rejecting an oversized paste", () => {
    expect(buildVoiceAnalysisInput("x".repeat(VOICE_MAX_CHARS + 5000))).toHaveLength(VOICE_MAX_CHARS);
  });
  it("survives a missing value", () => {
    expect(buildVoiceAnalysisInput(undefined)).toBe("");
  });
});

describe("upsertVoicePrompt", () => {
  it("appends when there is no voice prompt yet", () => {
    const out = upsertVoicePrompt([{ name: "Standup", text: "..." }], "style");
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ name: VOICE_PROMPT_NAME, text: "style" });
  });
  it("replaces the existing one instead of duplicating it", () => {
    const out = upsertVoicePrompt([{ name: VOICE_PROMPT_NAME, text: "old" }], "new");
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("new");
  });
  it("leaves the user's other prompts alone", () => {
    const before = [{ name: "A", text: "a" }, { name: VOICE_PROMPT_NAME, text: "old" }, { name: "B", text: "b" }];
    const out = upsertVoicePrompt(before, "new");
    expect(out.map(p => p.name)).toEqual(["A", VOICE_PROMPT_NAME, "B"]);
    expect(before[1].text).toBe("old"); // input not mutated
  });
  it("copes with no saved prompts at all", () => {
    expect(upsertVoicePrompt(undefined, "style")).toEqual([{ name: VOICE_PROMPT_NAME, text: "style" }]);
  });
});

describe("VOICE_ANALYSIS_PROMPT", () => {
  it("tells the model to emit only the instruction", () => {
    expect(VOICE_ANALYSIS_PROMPT).toMatch(/Output only the instruction/);
    expect(VOICE_ANALYSIS_PROMPT).toMatch(/Describe style only/);
  });
});
