import { MIN_IMPROVE_TARGET_HEIGHT } from "../lib/constants.js";

export function isTextInput(element) {
  if (!element) return false;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName === "INPUT" && (element.type === "text" || !element.type)) return true;
  return element.isContentEditable === true || element.contentEditable === "true";
}

// The button only makes sense on long-form composers, not single-line search
// boxes or username fields. Textareas are always multi-line by intent;
// contenteditable hosts (Gmail, Twitter/X, LinkedIn, Slack) are accepted only
// when they declare aria-multiline or render at least two lines tall.
export function isImproveTarget(element) {
  if (!element) return false;
  if (element.tagName === "TEXTAREA") return true;
  if (element.isContentEditable !== true && element.contentEditable !== "true") return false;
  if (element.getAttribute && element.getAttribute("aria-multiline") === "true") return true;
  const rect = typeof element.getBoundingClientRect === "function" ? element.getBoundingClientRect() : null;
  return !!rect && rect.height >= MIN_IMPROVE_TARGET_HEIGHT;
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
