import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../src/lib/browser.js", () => ({
  default: {
    storage: {
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() },
      sync: { get: vi.fn().mockResolvedValue({}), remove: vi.fn() },
    },
  },
}));

const { resolveEngineId, engineKeyVisibility, engineUsesModelPicker, engineModelSummary, ENGINES } = await import("../src/engines/index.js");
const { onDeviceEngine } = await import("../src/engines/ondevice.js");

describe("resolveEngineId", () => {
  it("honors an explicit, registered engine setting", () => {
    expect(resolveEngineId({ engineSetting: "openrouter", onDeviceAvail: "ready", hasGroqKey: true, hasOpenRouterKey: true })).toBe("openrouter");
  });

  it("auto prefers on-device when available", () => {
    expect(resolveEngineId({ engineSetting: "auto", onDeviceAvail: "ready", hasGroqKey: true, hasOpenRouterKey: true })).toBe("ondevice");
    expect(resolveEngineId({ engineSetting: "auto", onDeviceAvail: "downloadable", hasGroqKey: false, hasOpenRouterKey: false })).toBe("ondevice");
  });

  it("auto falls to groq when on-device unsupported and a groq key exists", () => {
    expect(resolveEngineId({ engineSetting: "auto", onDeviceAvail: "unsupported", hasGroqKey: true, hasOpenRouterKey: false })).toBe("groq");
  });

  it("auto falls to openrouter otherwise", () => {
    expect(resolveEngineId({ engineSetting: "auto", onDeviceAvail: "unsupported", hasGroqKey: false, hasOpenRouterKey: true })).toBe("openrouter");
    expect(resolveEngineId({ engineSetting: "auto", onDeviceAvail: "unsupported", hasGroqKey: false, hasOpenRouterKey: false })).toBe("openrouter");
  });

  it("honors an explicit on-device setting (now registered)", () => {
    expect(resolveEngineId({ engineSetting: "ondevice", onDeviceAvail: "ready", hasGroqKey: false, hasOpenRouterKey: true })).toBe("ondevice");
  });

  it("honors an explicit local setting", () => {
    expect(resolveEngineId({ engineSetting: "local", onDeviceAvail: "unsupported", hasGroqKey: false, hasOpenRouterKey: false })).toBe("local");
  });

  it("never resolves local from auto (local is opt-in only)", () => {
    expect(resolveEngineId({ engineSetting: "auto", onDeviceAvail: "unsupported", hasGroqKey: false, hasOpenRouterKey: false })).not.toBe("local");
  });
});

describe("engineKeyVisibility", () => {
  it("ondevice shows no key fields", () => {
    expect(engineKeyVisibility("ondevice")).toEqual({ groq: false, openrouter: false });
  });
  it("local shows no key fields (keyless)", () => {
    expect(engineKeyVisibility("local")).toEqual({ groq: false, openrouter: false });
  });
  it("groq shows only the Groq field", () => {
    expect(engineKeyVisibility("groq")).toEqual({ groq: true, openrouter: false });
  });
  it("openrouter shows only the OpenRouter field", () => {
    expect(engineKeyVisibility("openrouter")).toEqual({ groq: false, openrouter: true });
  });
  it("auto (and unknown) shows both", () => {
    expect(engineKeyVisibility("auto")).toEqual({ groq: true, openrouter: true });
    expect(engineKeyVisibility(undefined)).toEqual({ groq: true, openrouter: true });
  });
});

describe("engineUsesModelPicker", () => {
  it("shows the model picker for openrouter and auto", () => {
    expect(engineUsesModelPicker("openrouter")).toBe(true);
    expect(engineUsesModelPicker("auto")).toBe(true);
    expect(engineUsesModelPicker(undefined)).toBe(true);
  });
  it("hides it for engines with their own model", () => {
    expect(engineUsesModelPicker("ondevice")).toBe(false);
    expect(engineUsesModelPicker("groq")).toBe(false);
    expect(engineUsesModelPicker("local")).toBe(false);
  });
});

describe("engineModelSummary", () => {
  it("describes the fixed-model engines", () => {
    expect(engineModelSummary("ondevice")).toMatch(/Gemini Nano/);
    expect(engineModelSummary("groq")).toMatch(/Groq/);
  });
  it("returns null for picker engines and for local (resolved by the caller)", () => {
    expect(engineModelSummary("openrouter")).toBe(null);
    expect(engineModelSummary("auto")).toBe(null);
    expect(engineModelSummary("local")).toBe(null);
  });
});

describe("onDeviceEngine.availability", () => {
  afterEach(() => { delete globalThis.LanguageModel; });

  it("returns unsupported when LanguageModel is absent", async () => {
    delete globalThis.LanguageModel;
    expect(await onDeviceEngine.availability()).toBe("unsupported");
  });

  it("maps Chrome availability states", async () => {
    globalThis.LanguageModel = { availability: async () => "available" };
    expect(await onDeviceEngine.availability()).toBe("ready");
    globalThis.LanguageModel = { availability: async () => "downloadable" };
    expect(await onDeviceEngine.availability()).toBe("downloadable");
    globalThis.LanguageModel = { availability: async () => "unavailable" };
    expect(await onDeviceEngine.availability()).toBe("unsupported");
  });

  it("treats a thrown availability() as unsupported", async () => {
    globalThis.LanguageModel = { availability: async () => { throw new Error("boom"); } };
    expect(await onDeviceEngine.availability()).toBe("unsupported");
  });
});

describe("cloud engines registry", () => {
  it("registers ondevice, groq, openrouter, and local", () => {
    expect(Object.keys(ENGINES).sort()).toEqual(["groq", "local", "ondevice", "openrouter"]);
    expect(ENGINES.groq.kind).toBe("cloud");
    expect(ENGINES.openrouter.kind).toBe("cloud");
    expect(ENGINES.ondevice.kind).toBe("on-device");
    expect(ENGINES.local.kind).toBe("local");
  });

  it("groq reports needs-setup when no key is stored", async () => {
    expect(await ENGINES.groq.availability()).toBe("needs-setup");
  });
});
