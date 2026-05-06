// contentEditable cursor offsets are scoped to the inner text node, not the host element,
// so the substring math below is unsafe there. Skip rich editors (Gmail, Slack, etc.) until
// we have a Range-based implementation.
function isPlainTextField(element) {
  return element?.tagName === "TEXTAREA"
    || (element?.tagName === "INPUT" && (element.type === "text" || !element.type));
}

export function tryExpandSnippet(element, snippets) {
  if (!isPlainTextField(element)) return false;
  if (!Array.isArray(snippets) || snippets.length === 0) return false;

  const text = element.value;
  const cursor = element.selectionStart ?? text.length;
  const before = text.substring(0, cursor);

  for (const snippet of snippets) {
    if (!snippet?.trigger || !before.endsWith(snippet.trigger)) continue;
    const expanded = text.slice(0, cursor - snippet.trigger.length) + snippet.content + text.slice(cursor);
    element.value = expanded;
    const newCursor = cursor - snippet.trigger.length + snippet.content.length;
    element.selectionStart = element.selectionEnd = newCursor;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  return false;
}
