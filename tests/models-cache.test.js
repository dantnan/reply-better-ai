import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeStorage = (() => {
  let store = {};
  return {
    reset: (initial = {}) => { store = { ...initial }; },
    snapshot: () => ({ ...store }),
    api: {
      get: vi.fn(keys => {
        if (keys == null) return Promise.resolve({ ...store });
        const list = Array.isArray(keys) ? keys : (typeof keys === "string" ? [keys] : Object.keys(keys));
        const out = {};
        for (const k of list) if (k in store) out[k] = store[k];
        return Promise.resolve(out);
      }),
      set: vi.fn(obj => { Object.assign(store, obj); return Promise.resolve(); }),
      remove: vi.fn(keys => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) delete store[k];
        return Promise.resolve();
      }),
    },
  };
})();

vi.mock("../src/lib/browser.js", () => ({
  default: {
    storage: { local: fakeStorage.api, sync: { get: vi.fn().mockResolvedValue({}), remove: vi.fn() } },
  },
}));

vi.mock("../src/lib/openrouter.js", () => ({
  listModels: vi.fn(),
}));

const {
  getModels,
  validateSelectedModel,
  isFree,
  formatPrice,
  formatContextLength,
  getProvider,
  uniqueProviders,
} = await import("../src/lib/models-cache.js");
const { listModels } = await import("../src/lib/openrouter.js");

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

describe("getModels", () => {
  beforeEach(() => {
    fakeStorage.reset();
    listModels.mockReset();
  });

  it("returns cached models when within the TTL and never calls listModels", async () => {
    fakeStorage.reset({
      modelsCache: { models: [{ id: "a/b" }], cachedAt: Date.now() - 1000 },
    });
    const result = await getModels();
    expect(result.source).toBe("cache");
    expect(result.stale).toBe(false);
    expect(result.models).toEqual([{ id: "a/b" }]);
    expect(listModels).not.toHaveBeenCalled();
  });

  it("refetches when the cache is older than the TTL and writes back", async () => {
    fakeStorage.reset({
      modelsCache: { models: [{ id: "old/one" }], cachedAt: Date.now() - 60 * 60 * 1000 - 1000 },
    });
    listModels.mockResolvedValue([{ id: "new/one" }]);
    const result = await getModels();
    expect(result.source).toBe("fresh");
    expect(result.models).toEqual([{ id: "new/one" }]);
    expect(listModels).toHaveBeenCalledOnce();
    expect(fakeStorage.snapshot().modelsCache.models).toEqual([{ id: "new/one" }]);
  });

  it("forceRefresh ignores fresh cache", async () => {
    fakeStorage.reset({
      modelsCache: { models: [{ id: "cached" }], cachedAt: Date.now() },
    });
    listModels.mockResolvedValue([{ id: "fresh" }]);
    const result = await getModels({ forceRefresh: true });
    expect(result.source).toBe("fresh");
    expect(listModels).toHaveBeenCalledOnce();
  });

  it("falls back to stale cache with stale:true when fetch fails", async () => {
    fakeStorage.reset({
      modelsCache: { models: [{ id: "cached" }], cachedAt: Date.now() - 60 * 60 * 1000 - 1000 },
    });
    listModels.mockRejectedValue(new Error("network down"));
    const result = await getModels();
    expect(result.source).toBe("stale");
    expect(result.stale).toBe(true);
    expect(result.models).toEqual([{ id: "cached" }]);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("rethrows when there's no cache and fetch fails", async () => {
    listModels.mockRejectedValue(new Error("network down"));
    await expect(getModels()).rejects.toThrow("network down");
  });
});

describe("validateSelectedModel", () => {
  beforeEach(() => {
    fakeStorage.reset();
    listModels.mockReset();
  });

  it("returns valid:true when the saved id is in the live list", async () => {
    listModels.mockResolvedValue([{ id: "anthropic/claude-haiku-4.5" }, { id: "openai/gpt-5" }]);
    const result = await validateSelectedModel({ currentId: "openai/gpt-5" });
    expect(result.valid).toBe(true);
  });

  it("flags missing id and supplies fallback", async () => {
    listModels.mockResolvedValue([
      { id: "anthropic/claude-haiku-4.5" }, { id: "openai/gpt-5" },
    ]);
    const result = await validateSelectedModel({ currentId: "ghost/dead" });
    expect(result.valid).toBe(false);
    expect(result.fallback).toBe("anthropic/claude-haiku-4.5");
    expect(result.missingId).toBe("ghost/dead");
    expect(result.reason).toBe("not-found");
  });

  it("returns valid:true,deferred:true when offline and no cache", async () => {
    listModels.mockRejectedValue(new Error("offline"));
    const result = await validateSelectedModel({ currentId: "openai/gpt-5" });
    expect(result.valid).toBe(true);
    expect(result.deferred).toBe(true);
    expect(result.reason).toBe("offline");
  });

  it("returns valid:false,reason:missing when no currentId is set", async () => {
    const result = await validateSelectedModel({ currentId: undefined });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing");
    expect(listModels).not.toHaveBeenCalled();
  });
});
