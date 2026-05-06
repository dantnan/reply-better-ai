import { describe, it, expect, vi } from "vitest";

vi.mock("../src/lib/browser.js", () => ({
  default: {
    storage: {
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() },
      sync: { get: vi.fn().mockResolvedValue({}), remove: vi.fn() },
    },
  },
}));

const {
  isFree,
  formatPrice,
  formatContextLength,
  getProvider,
  uniqueProviders,
} = await import("../src/lib/models-cache.js");

describe("isFree", () => {
  it("returns true when prompt and completion are both 0", () => {
    expect(isFree({ pricing: { prompt: "0", completion: "0" } })).toBe(true);
  });

  it("returns false when prompt is non-zero", () => {
    expect(isFree({ pricing: { prompt: "0.000001", completion: "0" } })).toBe(false);
  });

  it("returns false when pricing is missing", () => {
    expect(isFree({})).toBe(false);
    expect(isFree(null)).toBe(false);
  });
});

describe("formatPrice", () => {
  it("returns Free for free models", () => {
    expect(formatPrice({ pricing: { prompt: "0", completion: "0" } })).toBe("Free");
  });

  it("formats Sonnet-like pricing as $3 / $15 per MTok", () => {
    const out = formatPrice({ pricing: { prompt: "0.000003", completion: "0.000015" } });
    expect(out).toContain("$3.00");
    expect(out).toContain("$15.00");
    expect(out).toContain("per MTok");
  });

  it("returns em dash for missing pricing", () => {
    expect(formatPrice({})).toBe("—");
  });
});

describe("formatContextLength", () => {
  it("formats 1M+ contexts as 1.0M", () => {
    expect(formatContextLength({ context_length: 1000000 })).toBe("1.0M");
  });

  it("formats K contexts", () => {
    expect(formatContextLength({ context_length: 200000 })).toBe("200K");
  });

  it("falls back to top_provider context", () => {
    expect(formatContextLength({ top_provider: { context_length: 8192 } })).toBe("8K");
  });

  it("returns empty string when no context length is known", () => {
    expect(formatContextLength({})).toBe("");
  });
});

describe("getProvider", () => {
  it("extracts the part before /", () => {
    expect(getProvider({ id: "anthropic/claude-haiku-4-5" })).toBe("anthropic");
  });

  it("returns empty for ids without /", () => {
    expect(getProvider({ id: "loose-id" })).toBe("");
  });
});

describe("uniqueProviders", () => {
  it("returns sorted unique providers", () => {
    const models = [
      { id: "openai/a" }, { id: "anthropic/b" },
      { id: "openai/c" }, { id: "google/d" },
    ];
    expect(uniqueProviders(models)).toEqual(["anthropic", "google", "openai"]);
  });

  it("ignores models with no slash in id", () => {
    expect(uniqueProviders([{ id: "loose" }, { id: "anthropic/x" }])).toEqual(["anthropic"]);
  });
});
