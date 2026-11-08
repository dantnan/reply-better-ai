// Builds the exact messages the extension sends, by importing the real prompt
// builders instead of copying them. If src/lib/system-prompts.js changes, the
// eval follows automatically.
//
// Message shape mirrors buildBody() in src/lib/openrouter.js: the system prompt
// we control, then the page text the user selected, verbatim. That second
// message is the injection surface these tests probe.
import { buildReplyPrompt, wrapConversation, resolveSystemPrompt } from "../src/lib/system-prompts.js";
import { languageFromInstruction } from "../src/lib/languages.js";

export function replyPrompt({ vars }) {
  const system = buildReplyPrompt({
    tone: vars.tone || "match",
    instruction: vars.instruction || "",
    summarize: vars.summarize === true || vars.summarize === "true",
    // Same rule as the service worker: an explicit language in the instruction
    // counts as "Write in" when none is chosen.
    // `detectedLanguage` stands in for the browser's detectLanguage(), which
    // the worker runs on the conversation when an instruction is present.
    language: vars.language
      || (vars.summarize ? undefined : languageFromInstruction(vars.instruction) || undefined)
      || (!vars.summarize && vars.instruction && vars.hasConversation !== false ? vars.detectedLanguage : undefined),
    avoid: vars.avoid,
    hasConversation: vars.hasConversation !== false,
  });
  return [
    { role: "system", content: system },
    { role: "user", content: wrapConversation(vars.text) },
  ];
}

// Improve mode. The draft is the user's own text, but it is still just text in
// a user message: when the draft happens to be a question, models answer it
// instead of rewriting it. These evals measure that.
export function improvePrompt({ vars }) {
  const system = resolveSystemPrompt(vars.style || "improve", vars.savedPrompts || [], {
    language: vars.language,
    avoid: vars.avoid,
  });
  return [
    { role: "system", content: system },
    { role: "user", content: vars.text },
  ];
}
