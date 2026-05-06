import browser from "../lib/browser.js";
import { storage } from "../lib/storage.js";
import { isTextInput, readText, writeText } from "./text-target.js";
import { injectStyles, createButton, findButtonFor, removeButtonFor, removeAllButtons, showToast } from "./button-injector.js";
import { tryExpandSnippet } from "./snippet-expander.js";

import { DEFAULT_MESSAGE_TYPE } from "../lib/constants.js";

const DEFAULT_SETTINGS = Object.freeze({
  enableInlineButton: true,
  inlineMessageType: DEFAULT_MESSAGE_TYPE,
  savedPrompts: [],
  snippets: [],
});
const settings = { ...DEFAULT_SETTINGS };

let activeElement = null;

async function loadSettings() {
  try {
    const stored = await storage.get([
      "enableInlineButton", "inlineMessageType", "savedPrompts", "snippets",
    ]);
    if (stored.enableInlineButton !== undefined) settings.enableInlineButton = stored.enableInlineButton;
    if (stored.inlineMessageType) settings.inlineMessageType = stored.inlineMessageType;
    if (Array.isArray(stored.savedPrompts)) settings.savedPrompts = stored.savedPrompts;
    if (Array.isArray(stored.snippets)) settings.snippets = stored.snippets;
  } catch (e) {
    // Fail closed: a user who turned the inline button off shouldn't see it back when storage hiccups.
    console.warn("[content] settings load failed; disabling inline UI:", e?.message);
    settings.enableInlineButton = false;
  }
}

async function improve(textElement, button) {
  const text = readText(textElement);
  if (!text.trim()) return;

  textElement.focus();
  button.classList.add("processing");
  button.classList.remove("error");

  try {
    const response = await sendMessage({
      action: "improveText",
      text,
      messageType: settings.inlineMessageType,
    }, 60000);

    if (response?.improvedText) {
      writeText(textElement, response.improvedText);
      textElement.focus();
    } else if (response?.error) {
      button.classList.add("error");
      showToast(response.error, { type: "error" });
      setTimeout(() => button.classList.remove("error"), 2000);
    } else {
      button.classList.add("error");
      showToast("Empty response from the model. Try again.", { type: "error" });
      setTimeout(() => button.classList.remove("error"), 2000);
    }
  } catch (err) {
    console.error("[content] improve failed:", err);
    button.classList.add("error");
    let msg = err.message || "Unexpected error.";
    if (msg.includes("Receiving end does not exist")) {
      msg = "The extension may be reloading. Refresh this page and try again.";
    } else if (msg.includes("timed out")) {
      msg = "Request timed out. The model is busy — try again in a moment.";
    }
    showToast(msg, { type: "error" });
    setTimeout(() => button.classList.remove("error"), 2000);
  } finally {
    button.classList.remove("processing");
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

const WATCHED_KEYS = ["enableInlineButton", "inlineMessageType", "savedPrompts", "snippets"];

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
