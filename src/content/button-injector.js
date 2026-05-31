import { STYLE_LABELS } from "../lib/system-prompts.js";
import { CUSTOM_PROMPT_PREFIX } from "../lib/constants.js";
import injectedCss from "./content-button.css";

const BUTTON_CLASS = "reply-better-button";

const buttons = [];

const PENCIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
};
const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

export function injectStyles() {
  if (document.getElementById("reply-better-styles")) return;
  const style = document.createElement("style");
  style.id = "reply-better-styles";
  style.textContent = injectedCss;
  document.head.appendChild(style);
}

function styleTitle(type, savedPrompts) {
  if (type?.startsWith(CUSTOM_PROMPT_PREFIX)) {
    const idx = parseInt(type.slice(CUSTOM_PROMPT_PREFIX.length), 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < savedPrompts.length) return savedPrompts[idx].name;
    return "Custom";
  }
  return STYLE_LABELS[type] || "Improve";
}

function position(textElement, button) {
  const rect = textElement.getBoundingClientRect();
  const sx = window.pageXOffset || document.documentElement.scrollLeft;
  const sy = window.pageYOffset || document.documentElement.scrollTop;
  button.style.top = `${rect.top + sy + 6}px`;
  button.style.left = `${rect.right + sx - 40}px`;
}

export function createButton(textElement, settings, onClick) {
  const button = document.createElement("button");
  button.className = BUTTON_CLASS;
  button.type = "button";
  button.title = `Improve with Reply Better AI (${styleTitle(settings.inlineMessageType, settings.savedPrompts || [])})`;
  button.innerHTML = PENCIL_SVG + '<span class="reply-better-spin"></span>';
  document.body.appendChild(button);
  position(textElement, button);
  requestAnimationFrame(() => button.classList.add("reply-better-visible"));

  button.addEventListener("mousedown", e => e.preventDefault());
  button.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    onClick(textElement, button);
  });

  buttons.push({ button, textElement });
}

export function setButtonLoading(button, loading) {
  button.classList.toggle("reply-better-loading", loading);
}

export function findButtonFor(textElement) {
  return buttons.find(b => b.textElement === textElement);
}

export function removeButtonFor(textElement) {
  const idx = buttons.findIndex(b => b.textElement === textElement);
  if (idx === -1) return;
  buttons[idx].button?.remove();
  buttons.splice(idx, 1);
}

export function removeAllButtons() {
  while (buttons.length > 0) buttons.pop().button?.remove();
}

// Toast with an optional action button (e.g. Undo). Returns the toast element.
export function showToast(message, { type = "info", action = null, duration = 4000 } = {}) {
  const toast = document.createElement("div");
  toast.className = `reply-better-toast reply-better-${type === "error" ? "error" : type === "success" ? "success" : "info"}`;

  const icon = document.createElement("span");
  icon.className = "reply-better-toast-icon";
  icon.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.info;

  const text = document.createElement("span");
  text.className = "reply-better-toast-text";
  text.textContent = message;

  toast.append(icon, text);

  let timer;
  const dismiss = () => {
    toast.classList.remove("reply-better-show");
    setTimeout(() => toast.remove(), 220);
  };

  if (action && typeof action.fn === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reply-better-toast-action";
    btn.textContent = action.label || "Undo";
    btn.addEventListener("click", () => { action.fn(); clearTimeout(timer); dismiss(); });
    toast.appendChild(btn);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "reply-better-toast-close";
  close.setAttribute("aria-label", "Dismiss");
  close.innerHTML = CLOSE_SVG;
  close.addEventListener("click", () => { clearTimeout(timer); dismiss(); });
  toast.appendChild(close);

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("reply-better-show"));
  timer = setTimeout(dismiss, duration);
  return toast;
}
