import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/browser.js", () => ({
  default: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      sync: {
        get: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

const { improveText, validateApiKey, listModels } = await import("../src/lib/openrouter.js");
const errors = await import("../src/lib/errors.js");

describe("improveText", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("posts the canonical OpenRouter chat/completions request", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "improved" } }] }),
    });

    const result = await improveText({
      text: "hello",
      apiKey: "sk-test",
      model: "anthropic/claude-haiku-4-5",
      systemPrompt: "be brief",
    });

    expect(result).toBe("improved");
    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers.Authorization).toBe("Bearer sk-test");
    expect(opts.headers["X-Title"]).toBe("Reply Better AI");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("anthropic/claude-haiku-4-5");
    expect(body.messages).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "hello" },
    ]);
  });

  it("maps 401 to InvalidKeyError", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid API key" } }),
    });
    await expect(improveText({
      text: "x", apiKey: "bad", model: "m", systemPrompt: "p",
    })).rejects.toBeInstanceOf(errors.InvalidKeyError);
  });

  it("maps 404 to ModelUnavailableError", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: "Model not found" } }),
    });
    await expect(improveText({
      text: "x", apiKey: "k", model: "ghost/missing", systemPrompt: "p",
    })).rejects.toBeInstanceOf(errors.ModelUnavailableError);
  });

  it("maps 429 to RateLimitError", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Too many requests" } }),
    });
    await expect(improveText({
      text: "x", apiKey: "k", model: "m", systemPrompt: "p",
    })).rejects.toBeInstanceOf(errors.RateLimitError);
  });

  it("maps 500 to ProviderError", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "upstream down" } }),
    });
    await expect(improveText({
      text: "x", apiKey: "k", model: "m", systemPrompt: "p",
    })).rejects.toBeInstanceOf(errors.ProviderError);
  });

  it("wraps fetch failures in NetworkError", async () => {
    global.fetch.mockRejectedValue(new TypeError("network down"));
    await expect(improveText({
      text: "x", apiKey: "k", model: "m", systemPrompt: "p",
    })).rejects.toBeInstanceOf(errors.NetworkError);
  });

  it("throws ProviderError on empty content", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: {} }] }),
    });
    await expect(improveText({
      text: "x", apiKey: "k", model: "m", systemPrompt: "p",
    })).rejects.toBeInstanceOf(errors.ProviderError);
  });
});

describe("validateApiKey", () => {
  beforeEach(() => { global.fetch = vi.fn(); });

  it("returns ok=true on 200", async () => {
    global.fetch.mockResolvedValue({ ok: true });
    expect(await validateApiKey("k")).toEqual({ ok: true });
  });

  it("flags 401 as reason=invalid (not as offline)", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401 });
    const result = await validateApiKey("bad");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid");
    expect(result.status).toBe(401);
  });

  it("flags 403 as reason=invalid", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 403 });
    expect((await validateApiKey("bad")).reason).toBe("invalid");
  });

  it("flags 5xx as reason=provider", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503 });
    const result = await validateApiKey("k");
    expect(result.reason).toBe("provider");
    expect(result.status).toBe(503);
  });

  it("flags fetch rejection as reason=network (does not throw)", async () => {
    global.fetch.mockRejectedValue(new TypeError("offline"));
    expect((await validateApiKey("k")).reason).toBe("network");
  });

  it("flags AbortError as reason=timeout", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    global.fetch.mockRejectedValue(abort);
    expect((await validateApiKey("k")).reason).toBe("timeout");
  });
});

describe("listModels", () => {
  beforeEach(() => { global.fetch = vi.fn(); });

  it("returns the data array", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "a/b", name: "AB" }, { id: "c/d", name: "CD" }] }),
    });
    const models = await listModels();
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("a/b");
  });

  it("returns [] when data is missing", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    expect(await listModels()).toEqual([]);
  });

  it("throws ProviderError on non-2xx", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    await expect(listModels()).rejects.toBeInstanceOf(errors.ProviderError);
  });
});
