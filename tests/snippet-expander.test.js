import { describe, it, expect } from "vitest";
import { tryExpandSnippet } from "../src/content/snippet-expander.js";

function makeTextarea({ value = "", selectionStart = value.length } = {}) {
  const el = {
    tagName: "TEXTAREA",
    value,
    selectionStart,
    selectionEnd: selectionStart,
    dispatchEvent() { this._dispatched = (this._dispatched ?? 0) + 1; },
  };
  return el;
}

function makeContentEditable({ innerText = "" } = {}) {
  return {
    tagName: "DIV",
    isContentEditable: true,
    contentEditable: "true",
    innerText,
    dispatchEvent() {},
  };
}

describe("tryExpandSnippet", () => {
  it("expands the trigger immediately before the cursor and returns true", () => {
    const el = makeTextarea({ value: "Hi /hello" });
    const result = tryExpandSnippet(el, [{ trigger: "/hello", content: "Hello world" }]);
    expect(result).toBe(true);
    expect(el.value).toBe("Hi Hello world");
    expect(el.selectionStart).toBe("Hi Hello world".length);
    expect(el._dispatched).toBe(1);
  });

  it("returns false when no trigger sits at the end of `before`", () => {
    const el = makeTextarea({ value: "Hi /hello there", selectionStart: "Hi /hello there".length });
    const result = tryExpandSnippet(el, [{ trigger: "/hello", content: "Hello" }]);
    expect(result).toBe(false);
    expect(el.value).toBe("Hi /hello there");
  });

  it("only consumes the trigger, leaving text after the cursor intact", () => {
    const el = makeTextarea({ value: "/hellothere", selectionStart: "/hello".length });
    const result = tryExpandSnippet(el, [{ trigger: "/hello", content: "X" }]);
    expect(result).toBe(true);
    expect(el.value).toBe("Xthere");
    expect(el.selectionStart).toBe(1);
  });

  it("returns false on empty / non-array snippets", () => {
    const el = makeTextarea({ value: "/x" });
    expect(tryExpandSnippet(el, [])).toBe(false);
    expect(tryExpandSnippet(el, null)).toBe(false);
    expect(tryExpandSnippet(el, undefined)).toBe(false);
    expect(el.value).toBe("/x");
  });

  it("matches the second snippet in the list when the first does not", () => {
    const el = makeTextarea({ value: "/two" });
    const snippets = [
      { trigger: "/one", content: "ONE" },
      { trigger: "/two", content: "TWO" },
    ];
    expect(tryExpandSnippet(el, snippets)).toBe(true);
    expect(el.value).toBe("TWO");
  });

  it("skips contentEditable hosts to avoid breaking nested rich-text DOM", () => {
    const el = makeContentEditable({ innerText: "/hello" });
    const result = tryExpandSnippet(el, [{ trigger: "/hello", content: "Hi" }]);
    expect(result).toBe(false);
  });

  it("ignores entries with missing or empty triggers", () => {
    const el = makeTextarea({ value: "x" });
    expect(tryExpandSnippet(el, [{ content: "no-trigger" }, { trigger: "", content: "empty" }])).toBe(false);
  });
});
