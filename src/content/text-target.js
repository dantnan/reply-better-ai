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
  } else {
    element.innerText = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
