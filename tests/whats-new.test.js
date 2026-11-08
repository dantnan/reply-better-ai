import { describe, it, expect } from "vitest";
import { WHATS_NEW_ID, WHATS_NEW_MAX_SHOWS, shouldShowWhatsNew, whatsNewAfterShown, whatsNewDismissed } from "../src/lib/whats-new.js";

describe("whats-new", () => {
  it("shows for an upgrading user who has never seen it", () => {
    expect(shouldShowWhatsNew(undefined)).toBe(true);
    expect(shouldShowWhatsNew({ id: "1.7", shown: 3, dismissed: true })).toBe(true); // older announcement
  });

  it("stops after the maximum number of shows", () => {
    let state;
    for (let i = 0; i < WHATS_NEW_MAX_SHOWS; i++) {
      expect(shouldShowWhatsNew(state)).toBe(true);
      state = whatsNewAfterShown(state);
    }
    expect(state).toEqual({ id: WHATS_NEW_ID, shown: WHATS_NEW_MAX_SHOWS, dismissed: false });
    expect(shouldShowWhatsNew(state)).toBe(false);
  });

  it("stops at once when dismissed", () => {
    expect(shouldShowWhatsNew(whatsNewDismissed())).toBe(false);
  });

  it("restarts the count for a new announcement id", () => {
    expect(whatsNewAfterShown({ id: "1.7", shown: 2 })).toEqual({ id: WHATS_NEW_ID, shown: 1, dismissed: false });
  });

  it("copes with junk stored values", () => {
    expect(shouldShowWhatsNew("junk")).toBe(true);
    expect(shouldShowWhatsNew({ id: WHATS_NEW_ID, shown: "x" })).toBe(true);
  });
});
