import { describe, it, expect } from "vitest";
import { diffWords } from "../src/lib/diff.js";

const reconstruct = (segs, side) =>
  segs.filter(s => s.type === "eq" || s.type === side).map(s => s.text).join("");

describe("diffWords", () => {
  it("returns a single eq segment for identical strings", () => {
    const segs = diffWords("hello world", "hello world");
    expect(segs).toEqual([{ type: "eq", text: "hello world" }]);
  });

  it("marks a pure insertion", () => {
    const segs = diffWords("hello", "hello there");
    expect(segs.some(s => s.type === "ins")).toBe(true);
    expect(segs.some(s => s.type === "del")).toBe(false);
  });

  it("marks a pure deletion", () => {
    const segs = diffWords("hello there", "hello");
    expect(segs.some(s => s.type === "del")).toBe(true);
    expect(segs.some(s => s.type === "ins")).toBe(false);
  });

  it("is reconstructable: del-side rebuilds 'before', ins-side rebuilds 'after'", () => {
    const before = "hey team did you look at the proposal thanks";
    const after = "Hi team, did you review the proposal? Thanks!";
    const segs = diffWords(before, after);
    expect(reconstruct(segs, "del")).toBe(before);
    expect(reconstruct(segs, "ins")).toBe(after);
  });

  it("coalesces adjacent same-type segments", () => {
    const segs = diffWords("a b c", "x y z");
    // no two consecutive segments share a type
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].type).not.toBe(segs[i - 1].type);
    }
  });

  it("handles empty before (all insertion) and empty after (all deletion)", () => {
    expect(diffWords("", "new text").every(s => s.type === "ins" || s.type === "eq")).toBe(true);
    expect(diffWords("old text", "").every(s => s.type === "del" || s.type === "eq")).toBe(true);
  });
});
