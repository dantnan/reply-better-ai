import contentButtonCss from "./content-button.css";
import replyModeCss from "./reply-mode.css";

// Two icons crossfade as the button morphs between Reply (bubble) and Improve
// (pencil). Stroke/fill come from the injected CSS (.reply-better-ic svg).
const PENCIL_SVG = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const REPLY_SVG = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
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
  style.textContent = `${contentButtonCss}\n${replyModeCss}`;
  (document.head || document.documentElement).appendChild(style);
}

// One shared morphing button follows the focused field — created once, then
// repositioned/re-moded as focus and content change.
let button = null;

export function ensureButton(onClick) {
  if (button && button.isConnected) return button;
  button = document.createElement("button");
  button.id = "rb-inline-btn";
  button.type = "button";
  button.className = "reply-better-button reply-better-mode-reply";
  button.setAttribute("aria-label", "Reply Better AI");
  button.innerHTML =
    '<span class="reply-better-iconwrap">' +
      `<span class="reply-better-ic reply-better-ic-improve">${PENCIL_SVG}</span>` +
      `<span class="reply-better-ic reply-better-ic-reply">${REPLY_SVG}</span>` +
      '<span class="reply-better-spin"></span>' +
    '</span>';
  button.addEventListener("mousedown", e => e.preventDefault());
  button.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); onClick(); });
  document.body.appendChild(button);
  return button;
}

export function getButton() {
  return button && button.isConnected ? button : null;
}

export function setButtonMode(mode) {
  if (!button) return;
  const reply = mode === "reply";
  button.classList.toggle("reply-better-mode-reply", reply);
  button.classList.toggle("reply-better-mode-improve", !reply);
  button.title = reply ? "Reply to the conversation" : "Improve what you wrote";
}

export function setButtonVisible(visible) {
  if (button) button.classList.toggle("reply-better-visible", visible);
}

export function setButtonLoading(loading) {
  if (button) button.classList.toggle("reply-better-loading", loading);
}

// Grammarly tucks its own badge into the bottom-right corner of the field too,
// and (higher z-index) hides ours — a common "the button never showed up"
// report. When Grammarly is on the page, shift ours left to clear its badge.
const GRAMMARLY_OFFSET = 32;
function competitorOffset() {
  return document.querySelector("grammarly-desktop-integration, grammarly-extension") ? GRAMMARLY_OFFSET : 0;
}

// Tuck the button into the bottom-right corner of the field's visible box.
// Bail when the field is detached/zero-sized so it never jumps to (0,0).
export function positionButton(field) {
  if (!button || !field) return;
  const rect = field.getBoundingClientRect();
  if (!field.isConnected || (rect.width === 0 && rect.height === 0)) return;
  const sx = window.pageXOffset || document.documentElement.scrollLeft;
  const sy = window.pageYOffset || document.documentElement.scrollTop;
  const bw = button.offsetWidth || 28;
  const bh = button.offsetHeight || 28;
  button.style.top = `${rect.bottom + sy - bh - 6}px`;
  button.style.left = `${rect.right + sx - bw - 6 - competitorOffset()}px`;
}

export function removeButton() {
  if (button) { button.remove(); button = null; }
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
