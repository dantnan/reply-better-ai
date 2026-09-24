// Builds the exact messages the extension sends, by importing the real prompt
// builders instead of copying them. If src/lib/system-prompts.js changes, the
// eval follows automatically.
//
// Message shape mirrors buildBody() in src/lib/openrouter.js: the system prompt
// we control, then the page text the user selected, verbatim. That second
// message is the injection surface these tests probe.
import { buildReplyPrompt, wrapConversation } from "../src/lib/system-prompts.js";

export function replyPrompt({ vars }) {
  const system = buildReplyPrompt({
    tone: vars.tone || "match",
    instruction: vars.instruction || "",
    summarize: vars.summarize === true || vars.summarize === "true",
  });
  return [
    { role: "system", content: system },
    { role: "user", content: wrapConversation(vars.text) },
  ];
}
