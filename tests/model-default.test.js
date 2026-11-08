import { describe, it, expect } from "vitest";
import { defaultModelMigration, PREVIOUS_DEFAULTS } from "../src/lib/model-default.js";

const NEW = "anthropic/claude-haiku-5.5";

describe("defaultModelMigration", () => {
  it("moves a user on the old default to the new one, with a notice", () => {
    expect(defaultModelMigration(PREVIOUS_DEFAULTS[0], NEW, 123)).toEqual({
      model: NEW,
      modelChangeNotice: { from: PREVIOUS_DEFAULTS[0], to: NEW, at: 123 },
    });
  });

  it("leaves any other model alone", () => {
    expect(defaultModelMigration("openai/gpt-5", NEW)).toBeNull();
    expect(defaultModelMigration("openrouter/auto-free", NEW)).toBeNull();
  });

  it("does nothing when the model is already the new default or not set", () => {
    expect(defaultModelMigration(NEW, NEW)).toBeNull();
    expect(defaultModelMigration(undefined, NEW)).toBeNull();
  });
});
