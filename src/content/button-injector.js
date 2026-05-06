import { TYPE_LABELS } from "../lib/system-prompts.js";
import { CUSTOM_PROMPT_PREFIX } from "../lib/constants.js";

const BUTTON_CLASS = "reply-better-button";
const TOOLTIP_CLASS = "reply-better-tooltip";

const buttons = [];

export function injectStyles() {
  if (document.getElementById("reply-better-styles")) return;
  const style = document.createElement("style");
  style.id = "reply-better-styles";
  style.textContent = `
    .${BUTTON_CLASS} {
      position: absolute; width: 30px; height: 30px;
      background-color: #3498db; color: white; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      font-size: 16px; z-index: 99999; border: none;
      transition: transform 0.2s, background-color 0.2s;
    }
    .${BUTTON_CLASS}:hover { transform: scale(1.1); background-color: #2980b9; }
    .${BUTTON_CLASS}.processing { background-color: #f39c12; animation: rb-pulse 1.5s infinite; }
    .${BUTTON_CLASS}.error { background-color: #e74c3c; }
    @keyframes rb-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
    .${TOOLTIP_CLASS} {
      position: absolute; background-color: #34495e; color: white;
      padding: 5px 10px; border-radius: 4px; font-size: 12px;
      z-index: 99999; opacity: 0; transition: opacity 0.3s;
      pointer-events: none; white-space: nowrap;
    }
    .${BUTTON_CLASS}:hover + .${TOOLTIP_CLASS} { opacity: 1; }
    .reply-better-toast {
      position: fixed; top: 20px; right: 20px;
      background-color: #2c3e50; color: white;
      padding: 12px 16px; border-radius: 6px;
      font-size: 13px; z-index: 100000;
      max-width: 320px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      opacity: 0; transition: opacity 0.3s;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .reply-better-toast.error { background-color: #c0392b; }
    .reply-better-toast.show { opacity: 1; }
  `;
  document.head.appendChild(style);
}

function getTypeLabel(type, savedPrompts) {
  if (type?.startsWith(CUSTOM_PROMPT_PREFIX)) {
    const idx = parseInt(type.slice(CUSTOM_PROMPT_PREFIX.length), 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < savedPrompts.length) {
      return savedPrompts[idx].name.substring(0, 10);
    }
    return "Custom";
  }
  return TYPE_LABELS[type] || "Pro";
}

function positionElements(textElement, button, tooltip) {
  const rect = textElement.getBoundingClientRect();
  const sx = window.pageXOffset || document.documentElement.scrollLeft;
  const sy = window.pageYOffset || document.documentElement.scrollTop;
  button.style.top = `${rect.top + sy + 5}px`;
  button.style.left = `${rect.right + sx - 35}px`;
  tooltip.style.top = `${rect.top + sy - 25}px`;
  tooltip.style.left = `${rect.right + sx - 80}px`;
}

export function createButton(textElement, settings, onClick) {
  if (!settings.enableInlineButton) return null;
  const button = document.createElement("button");
  button.className = BUTTON_CLASS;
  button.textContent = "✍️";
  button.title = "Improve with Reply Better AI";
  document.body.appendChild(button);

  const tooltip = document.createElement("div");
  tooltip.className = TOOLTIP_CLASS;
  tooltip.textContent = `Improve text (${getTypeLabel(settings.inlineMessageType, settings.savedPrompts || [])})`;
  document.body.appendChild(tooltip);

  positionElements(textElement, button, tooltip);

  button.addEventListener("mousedown", e => e.preventDefault());
  button.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    onClick(textElement, button);
  });

  buttons.push({ button, tooltip, textElement });
  return { button, tooltip };
}

export function findButtonFor(textElement) {
  return buttons.find(b => b.textElement === textElement);
}

export function removeButtonFor(textElement) {
  const idx = buttons.findIndex(b => b.textElement === textElement);
  if (idx === -1) return;
  const entry = buttons[idx];
  entry.button?.remove();
  entry.tooltip?.remove();
  buttons.splice(idx, 1);
}

export function removeAllButtons() {
  while (buttons.length > 0) {
    const entry = buttons.pop();
    entry.button?.remove();
    entry.tooltip?.remove();
  }
}

export function showToast(message, { type = "info", duration = 4000 } = {}) {
  const toast = document.createElement("div");
  toast.className = `reply-better-toast ${type === "error" ? "error" : ""}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
