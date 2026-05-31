import browser from "../lib/browser.js";
import { storage } from "../lib/storage.js";
import { isTextInput, isImproveTarget, readText, writeText } from "./text-target.js";
import { injectStyles, createButton, findButtonFor, removeButtonFor, removeAllButtons, showToast, setButtonLoading } from "./button-injector.js";
import { tryExpandSnippet } from "./snippet-expander.js";
import { openPanel } from "./panel.js";

import { DEFAULT_STYLE, DEFAULT_CLICK_MODE } from "../lib/constants.js";

const DEFAULT_SETTINGS = Object.freeze({
  enableInlineButton: true,
  inlineMessageType: DEFAULT_STYLE,
  inlineClickMode: DEFAULT_CLICK_MODE,
  savedPrompts: [],
  snippets: [],
});
const settings = { ...DEFAULT_SETTINGS };

let activeElement = null;

async function loadSettings() {
  try {
    const stored = await storage.get([
      "enableInlineButton", "inlineMessageType", "inlineClickMode", "savedPrompts", "snippets",
    ]);
    if (stored.enableInlineButton !== undefined) settings.enableInlineButton = stored.enableInlineButton;
    if (stored.inlineMessageType) settings.inlineMessageType = stored.inlineMessageType;
    if (stored.inlineClickMode) settings.inlineClickMode = stored.inlineClickMode;
    if (Array.isArray(stored.savedPrompts)) settings.savedPrompts = stored.savedPrompts;
    if (Array.isArray(stored.snippets)) settings.snippets = stored.snippets;
  } catch (e) {
    // Fail closed: a user who turned the inline button off shouldn't see it back when storage hiccups.
    console.warn("[content] settings load failed; disabling inline UI:", e?.message);
    settings.enableInlineButton = false;
  }
}

// Click handler: open the review panel (default) or improve instantly.
function improve(textElement, button) {
  if (settings.inlineClickMode === "instant") return improveInstant(textElement, button);
  return improveViaPanel(textElement, button);
}

function improveViaPanel(textElement, button) {
  const text = readText(textElement);
  if (!text.trim()) return;
  const previous = text;
  openPanel({
    anchorButton: button,
    inputText: text,
    settings,
    onInsert: result => {
      writeText(textElement, result);
      textElement.focus();
      showToast("Inserted.", {
        type: "success",
        duration: 6000,
        action: { label: "Undo", fn: () => { writeText(textElement, previous); textElement.focus(); } },
      });
    },
  });
}

async function improveInstant(textElement, button) {
  const text = readText(textElement);
  if (!text.trim()) return;

  const previous = text; // snapshot for Undo
  textElement.focus();
  setButtonLoading(button, true);
  button.classList.remove("reply-better-error");

  const flashError = msg => {
    button.classList.add("reply-better-error");
    showToast(msg, { type: "error" });
    setTimeout(() => button.classList.remove("reply-better-error"), 2000);
  };

  try {
    const response = await sendMessage({
      action: "improveText",
      text,
      messageType: settings.inlineMessageType,
    }, 60000);

    if (response?.improvedText) {
      writeText(textElement, response.improvedText);
      textElement.focus();
      // Direct rewrite + safety net: an Undo that restores the original text.
      showToast("Text improved.", {
        type: "success",
        duration: 6000,
        action: {
          label: "Undo",
          fn: () => { writeText(textElement, previous); textElement.focus(); },
        },
      });
    } else if (response?.error) {
      flashError(response.error);
    } else {
      flashError("Empty response from the model. Try again.");
    }
  } catch (err) {
    console.error("[content] improve failed:", err);
    let msg = err.message || "Unexpected error.";
    if (msg.includes("Receiving end does not exist")) {
      msg = "The extension may be reloading. Refresh this page and try again.";
    } else if (msg.includes("timed out")) {
      msg = "Request timed out. The model is busy — try again in a moment.";
    }
    flashError(msg);
  } finally {
    setButtonLoading(button, false);
  }
}

function sendMessage(payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
    browser.runtime.sendMessage(payload)
      .then(response => {
        clearTimeout(timer);
        if (response === undefined || response === null) {
          reject(new Error("Empty response from background"));
        } else {
          resolve(response);
        }
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function ensureButton(element) {
  if (!settings.enableInlineButton) return;
  if (!isImproveTarget(element)) {
    removeButtonFor(element);
    return;
  }
  const text = readText(element);
  if (!text.trim()) {
    removeButtonFor(element);
    return;
  }
  if (!findButtonFor(element)) {
    createButton(element, settings, improve);
  }
}

function handleFocus(event) {
  if (!isTextInput(event.target)) return;
  activeElement = event.target;
  ensureButton(activeElement);
}

function handleBlur(event) {
  if (!isTextInput(event.target)) return;
  // Delay so click on our button can land first
  const target = event.target;
  setTimeout(() => {
    if (document.activeElement === target) return;
    removeButtonFor(target);
    if (activeElement === target) activeElement = null;
  }, 200);
}

function handleInput(event) {
  const element = event.target;
  if (!isTextInput(element)) return;
  if (settings.enableInlineButton) ensureButton(element);
  if (settings.snippets.length > 0) tryExpandSnippet(element, settings.snippets);
}

function handleResize() {
  removeAllButtons();
  if (activeElement && readText(activeElement).trim()) {
    ensureButton(activeElement);
  }
}

const WATCHED_KEYS = ["enableInlineButton", "inlineMessageType", "inlineClickMode", "savedPrompts", "snippets"];

async function init() {
  await loadSettings();
  injectStyles();
  document.addEventListener("focus", handleFocus, true);
  document.addEventListener("blur", handleBlur, true);
  document.addEventListener("input", handleInput, true);
  window.addEventListener("resize", handleResize);

  // storage.onChanged avoids needing tabs.sendMessage host_permissions.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let touched = false;
    for (const key of WATCHED_KEYS) {
      if (!(key in changes)) continue;
      const newValue = changes[key].newValue;
      // newValue is undefined when a key was removed; fall back to the default
      // rather than letting "boolean turns into undefined" silently flip behaviour.
      settings[key] = newValue !== undefined ? newValue : DEFAULT_SETTINGS[key];
      touched = true;
    }
    if (touched) {
      removeAllButtons();
      if (activeElement && readText(activeElement).trim()) ensureButton(activeElement);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
