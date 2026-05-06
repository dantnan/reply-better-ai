import { describe, it, expect } from "vitest";
import { isTextInput, isImproveTarget } from "../src/content/text-target.js";

function makeElement({ tagName = "DIV", type, contentEditable, isContentEditable, ariaMultiline, height } = {}) {
  return {
    tagName,
    type,
    contentEditable,
    isContentEditable,
    getAttribute(name) {
      if (name === "aria-multiline") return ariaMultiline ?? null;
      return null;
    },
    getBoundingClientRect() {
      return { height: height ?? 0 };
    },
  };
}

describe("isTextInput", () => {
  it("accepts textarea", () => {
    expect(isTextInput(makeElement({ tagName: "TEXTAREA" }))).toBe(true);
  });

  it("accepts input[type=text] and input with no explicit type", () => {
    expect(isTextInput(makeElement({ tagName: "INPUT", type: "text" }))).toBe(true);
    expect(isTextInput(makeElement({ tagName: "INPUT" }))).toBe(true);
  });

  it("accepts contentEditable hosts", () => {
    expect(isTextInput(makeElement({ tagName: "DIV", isContentEditable: true }))).toBe(true);
    expect(isTextInput(makeElement({ tagName: "DIV", contentEditable: "true" }))).toBe(true);
  });

  it("rejects null / non-text inputs / non-editable divs", () => {
    expect(isTextInput(null)).toBe(false);
    expect(isTextInput(makeElement({ tagName: "INPUT", type: "checkbox" }))).toBe(false);
    expect(isTextInput(makeElement({ tagName: "DIV" }))).toBe(false);
  });
});

describe("isImproveTarget", () => {
  it("accepts textarea unconditionally", () => {
    expect(isImproveTarget(makeElement({ tagName: "TEXTAREA" }))).toBe(true);
  });

  it("rejects every <input> regardless of type", () => {
    for (const type of ["text", "search", "email", "url", "tel", undefined]) {
      expect(isImproveTarget(makeElement({ tagName: "INPUT", type }))).toBe(false);
    }
  });

  it("accepts contenteditable when aria-multiline is true", () => {
    expect(isImproveTarget(makeElement({
      tagName: "DIV", isContentEditable: true, ariaMultiline: "true", height: 18,
    }))).toBe(true);
  });

  it("accepts contenteditable when rendered tall enough", () => {
    expect(isImproveTarget(makeElement({
      tagName: "DIV", isContentEditable: true, height: 80,
    }))).toBe(true);
  });

  it("rejects single-line contenteditable (height below threshold and no aria-multiline)", () => {
    expect(isImproveTarget(makeElement({
      tagName: "DIV", isContentEditable: true, height: 22,
    }))).toBe(false);
  });

  it("rejects non-editable divs even if tall", () => {
    expect(isImproveTarget(makeElement({ tagName: "DIV", height: 200 }))).toBe(false);
  });

  it("rejects null", () => {
    expect(isImproveTarget(null)).toBe(false);
  });
});
