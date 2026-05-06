export function isTextInput(element) {
  if (!element) return false;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName === "INPUT" && (element.type === "text" || !element.type)) return true;
  return element.isContentEditable === true || element.contentEditable === "true";
}

export function readText(element) {
  if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") return element.value;
  return element.innerText;
}

export function writeText(element, value) {
  if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    element.innerText = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function getCursorPosition(element) {
  if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
    return element.selectionStart ?? 0;
  }
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    return selection.getRangeAt(0).startOffset;
  }
  return 0;
}

export function setCursorPosition(element, position) {
  if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
    element.selectionStart = position;
    element.selectionEnd = position;
    return;
  }
  if (!element.isContentEditable) return;
  const selection = window.getSelection();
  const range = document.createRange();
  let node = element.firstChild;
  if (!node) {
    const text = document.createTextNode(element.innerText);
    element.appendChild(text);
    node = text;
  }
  let pos = 0;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;
      if (pos + len >= position) {
        range.setStart(node, position - pos);
        range.setEnd(node, position - pos);
        break;
      }
      pos += len;
    }
    node = node.nextSibling;
  }
  selection.removeAllRanges();
  selection.addRange(range);
}
