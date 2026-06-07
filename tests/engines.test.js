import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../src/lib/browser.js", () => ({
  default: {
    storage: {
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() },
      sync: { get: vi.fn().mockResolvedValue({}), remove: vi.fn() },
    },
  },
}));

const { resolveEngineId, ENGINES } = await import("../src/engines/index.js");
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
  it("registers ondevice, groq, and openrouter", () => {
    expect(Object.keys(ENGINES).sort()).toEqual(["groq", "ondevice", "openrouter"]);
    expect(ENGINES.groq.kind).toBe("cloud");
    expect(ENGINES.openrouter.kind).toBe("cloud");
    expect(ENGINES.ondevice.kind).toBe("on-device");
  });

  it("groq reports needs-setup when no key is stored", async () => {
    expect(await ENGINES.groq.availability()).toBe("needs-setup");
  });
});
