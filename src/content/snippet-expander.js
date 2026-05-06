import { getCursorPosition, setCursorPosition, readText, writeText } from "./text-target.js";

export function tryExpandSnippet(element, snippets) {
  if (!Array.isArray(snippets) || snippets.length === 0) return false;
  const text = readText(element);
  const cursor = getCursorPosition(element);
  const before = text.substring(0, cursor);

  for (const snippet of snippets) {
    if (!snippet?.trigger || !before.endsWith(snippet.trigger)) continue;
    const expanded = text.slice(0, cursor - snippet.trigger.length) + snippet.content + text.slice(cursor);
    writeText(element, expanded);
    const newCursor = cursor - snippet.trigger.length + snippet.content.length;
    setCursorPosition(element, newCursor);
    return true;
  }
  return false;
}
