// When the default model changes, users still on an older default move to the
// new one once, with a notice in the popup. Install saves the default as an
// explicit choice, so we can't tell "picked it" from "never changed it"; the
// notice says how to switch back.
export const PREVIOUS_DEFAULTS = ["anthropic/claude-haiku-4.5"];

export function defaultModelMigration(model, newDefault, now = Date.now()) {
  if (!model || model === newDefault || !PREVIOUS_DEFAULTS.includes(model)) return null;
  return { model: newDefault, modelChangeNotice: { from: model, to: newDefault, at: now } };
}
