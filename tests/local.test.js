import { describe, it, expect, vi, beforeEach } from "vitest";

// storage.get is driven per-test by setting `storeData`.
let storeData = {};
vi.mock("../src/lib/browser.js", () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async keys => {
          const ks = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(ks.filter(k => k in storeData).map(k => [k, storeData[k]]));
        }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      sync: { get: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

const { makeLocalEngine, listLocalModels } = await import("../src/engines/local.js");
const errors = await import("../src/lib/errors.js");

const engine = makeLocalEngine();

beforeEach(() => {
  storeData = {};
  global.fetch = vi.fn();
});

describe("makeLocalEngine.availability", () => {
  it("returns needs-setup when no base URL is stored — and issues NO network call", async () => {
    storeData = {};
    expect(await engine.availability()).toBe("needs-setup");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns ready when a base URL is stored — still NO network call (hot-path safe)", async () => {
    storeData = { localBaseUrl: "http://localhost:11434/v1" };
    expect(await engine.availability()).toBe("ready");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("makeLocalEngine.streamImprove guards", () => {
  it("errors (no request) when the base URL is unset", async () => {
    storeData = { localModel: "llama3" };
    await expect(engine.streamImprove({ text: "x", systemPrompt: "s" })).rejects.toThrow(/server URL/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("errors (no request) when no model is selected", async () => {
    storeData = { localBaseUrl: "http://localhost:11434/v1" };
    await expect(engine.streamImprove({ text: "x", systemPrompt: "s" })).rejects.toThrow(/pick a (local )?model/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rethrows an unreachable server as an actionable, user-facing message", async () => {
    storeData = { localBaseUrl: "http://localhost:11434/v1", localModel: "llama3" };
    global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(engine.streamImprove({ text: "x", systemPrompt: "s" }))
      .rejects.toThrow(/Couldn't reach your local server/i);
  });
});

describe("listLocalModels", () => {
  it("returns the data array on success", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: "llama3" }, { id: "qwen2.5" }] }) });
    const models = await listLocalModels("http://localhost:11434/v1");
    expect(models.map(m => m.id)).toEqual(["llama3", "qwen2.5"]);
    expect(global.fetch.mock.calls[0][0]).toBe("http://localhost:11434/v1/models");
  });

  it("returns [] when reachable but the list is empty/odd-shaped", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    expect(await listLocalModels("http://localhost:1234/v1")).toEqual([]);
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    expect(await listLocalModels("http://localhost:1234/v1")).toEqual([]);
  });

  it("returns [] for an empty base URL without fetching", async () => {
    expect(await listLocalModels("")).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws NetworkError when the server can't be reached", async () => {
    global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(listLocalModels("http://localhost:11434/v1")).rejects.toBeInstanceOf(errors.NetworkError);
  });

  it("throws NetworkError on a non-OK response", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(listLocalModels("http://localhost:11434/v1")).rejects.toBeInstanceOf(errors.NetworkError);
  });
});
