// One-time "New in this version" line in the inline panel. Chrome updates
// extensions silently, so without it most users never learn what changed.
// Shown on up to MAX_SHOWS panel opens, or until dismissed. Fresh installs skip
// it (everything is new to them); see onInstalled in the service worker.
// Bump WHATS_NEW_ID (and the text in panel.js) to announce a later release.
export const WHATS_NEW_ID = "1.8";
export const WHATS_NEW_MAX_SHOWS = 3;

export function shouldShowWhatsNew(state) {
  if (!state || typeof state !== "object" || state.id !== WHATS_NEW_ID) return true;
  return !state.dismissed && (Number(state.shown) || 0) < WHATS_NEW_MAX_SHOWS;
}

export function whatsNewAfterShown(state) {
  const shown = state && state.id === WHATS_NEW_ID ? Number(state.shown) || 0 : 0;
  return { id: WHATS_NEW_ID, shown: shown + 1, dismissed: false };
}

export function whatsNewDismissed() {
  return { id: WHATS_NEW_ID, shown: WHATS_NEW_MAX_SHOWS, dismissed: true };
}
