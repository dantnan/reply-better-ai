import { describe, it, expect, vi } from "vitest";

vi.mock("../src/lib/browser.js", () => ({
  default: {
    storage: {
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() },
      sync: { get: vi.fn().mockResolvedValue({}), remove: vi.fn() },
    },
  },
}));

const { resolveEngineId } = await import("../src/engines/index.js");

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

  it("ignores an explicit setting that isn't a registered engine (falls through to auto logic)", () => {
    // "ondevice" isn't registered yet -> not in ENGINES -> auto logic applies
    expect(resolveEngineId({ engineSetting: "ondevice", onDeviceAvail: "unsupported", hasGroqKey: false, hasOpenRouterKey: true })).toBe("openrouter");
  });
});
