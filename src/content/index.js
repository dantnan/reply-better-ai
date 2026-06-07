import browser from "../lib/browser.js";
import { storage } from "../lib/storage.js";
import { isTextInput, isImproveTarget, readText, writeText } from "./text-target.js";
import {
  injectStyles, ensureButton, getButton, setButtonMode, setButtonVisible,
  setButtonLoading, positionButton, removeButton, showToast,
} from "./button-injector.js";
import { tryExpandSnippet } from "./snippet-expander.js";
import { openPanel, isPanelOpen, closePanel } from "./panel.js";
import { DEFAULT_STYLE, DEFAULT_CLICK_MODE, DEFAULT_MODEL } from "../lib/constants.js";

const DEFAULT_SETTINGS = Object.freeze({
  enableInlineButton: true,
  inlineMessageType: DEFAULT_STYLE,
  inlineClickMode: DEFAULT_CLICK_MODE,
  model: DEFAULT_MODEL,
  replyConsent: false,
  savedPrompts: [],
  snippets: [],
});
const settings = { ...DEFAULT_SETTINGS };

let activeField = null;

async function loadSettings() {
  try {
    const stored = await storage.get([
      "enableInlineButton", "inlineMessageType", "inlineClickMode",
      "model", "replyConsent", "savedPrompts", "snippets",
    ]);
    if (stored.enableInlineButton !== undefined) settings.enableInlineButton = stored.enableInlineButton;
    if (stored.inlineMessageType) settings.inlineMessageType = stored.inlineMessageType;
    if (stored.inlineClickMode) settings.inlineClickMode = stored.inlineClickMode;
    if (stored.model) settings.model = stored.model;
    if (stored.replyConsent !== undefined) settings.replyConsent = stored.replyConsent;
    if (Array.isArray(stored.savedPrompts)) settings.savedPrompts = stored.savedPrompts;
    if (Array.isArray(stored.snippets)) settings.snippets = stored.snippets;
  } catch (e) {
    // Fail closed: a user who turned the inline button off shouldn't see it back when storage hiccups.
    console.warn("[content] settings load failed; disabling inline UI:", e?.message);
    settings.enableInlineButton = false;
  }
}

// Reply when the user has selected text elsewhere on the page; improve when
// they've typed a draft in the field; reply (the friendly default) when empty.
function hasReplySelection(field) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return false;
  if (!sel.toString().trim()) return false;
  // A selection entirely inside the compose field is the user's own draft, not
  // a reply target — ignore it.
  if (field && sel.anchorNode && field.contains(sel.anchorNode) && field.contains(sel.focusNode)) return false;
  return true;
}

function detectMode(field) {
  if (hasReplySelection(field)) return "reply";
  if (field && readText(field).trim()) return "improve";
  return "reply";
}

function onButtonClick() {
  if (!activeField) return;
  const mode = detectMode(activeField);
  setButtonMode(mode);
  if (mode === "improve" && settings.inlineClickMode === "instant") {
    improveInstant(activeField);
    return;
  }
  openPanelFor(activeField, mode);
}

function openPanelFor(field, mode) {
  const button = getButton();
  if (!button) return;
  const previous = readText(field);
  openPanel({
    anchorButton: button,
    field,
    mode,
    draft: previous,
    settings,
    onInsert: result => {
      writeText(field, result);
      field.focus();
      showToast(mode === "improve" ? "Your message was polished." : "Reply inserted.", {
        type: "success",
        duration: 6000,
        action: { label: "Undo", fn: () => { writeText(field, previous); field.focus(); } },
      });
    },
  });
}

async function improveInstant(field) {
  const text = readText(field);
  if (!text.trim()) return;
  const previous = text;
  field.focus();
  setButtonLoading(true);
  try {
    const response = await sendMessage({
      action: "improveText",
      text,
      messageType: settings.inlineMessageType,
    }, 60000);
    if (response?.improvedText) {
      writeText(field, response.improvedText);
      field.focus();
      showToast("Text improved.", {
        type: "success",
        duration: 6000,
        action: { label: "Undo", fn: () => { writeText(field, previous); field.focus(); } },
      });
    } else if (response?.error) {
      showToast(response.error, { type: "error" });
    } else {
      showToast("Empty response from the model. Try again.", { type: "error" });
    }
  } catch (err) {
    console.error("[content] improve failed:", err);
    let msg = err.message || "Unexpected error.";
    if (msg.includes("Receiving end does not exist")) msg = "The extension may be reloading. Refresh this page and try again.";
    else if (msg.includes("timed out")) msg = "Request timed out. The model is busy — try again in a moment.";
    showToast(msg, { type: "error" });
  } finally {
    setButtonLoading(false);
  }
}

function sendMessage(payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
    browser.runtime.sendMessage(payload)
      .then(response => {
        clearTimeout(timer);
        if (response === undefined || response === null) reject(new Error("Empty response from background"));
        else resolve(response);
      })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

// Show + position the morph button for a field, reflecting the current mode.
function showButtonFor(field) {
  if (!settings.enableInlineButton || !isImproveTarget(field)) return;
  ensureButton(onButtonClick);
  setButtonMode(detectMode(field));
  setButtonVisible(true);
  positionButton(field);
}

function hideButton() {
  setButtonVisible(false);
}

function refreshButton() {
  if (!activeField || !getButton()) return;
  setButtonMode(detectMode(activeField));
  positionButton(activeField);
}

function handleFocus(event) {
  if (!isTextInput(event.target)) return;
  activeField = event.target;
  showButtonFor(activeField);
}

function handleBlur(event) {
  if (!isTextInput(event.target)) return;
  if (isPanelOpen()) return; // interacting with the panel blurs the field; keep the button
  const target = event.target;
  setTimeout(() => {
    if (document.activeElement === target) return;
    if (isPanelOpen()) return;
    // Keep the button alive while the user is selecting the text they want to
    // reply to — selecting in the page blurs the composer, but that's exactly
    // when the reply button is needed. Reposition stays anchored to the field.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) { setButtonMode("reply"); return; }
    hideButton();
    if (activeField === target) activeField = null;
  }, 200);
}

function handleInput(event) {
  const element = event.target;
  if (!isTextInput(element)) return;
  if (settings.enableInlineButton && activeField === element) refreshButton();
  if (settings.snippets.length > 0) tryExpandSnippet(element, settings.snippets);
}

function handleSelectionChange() {
  if (!activeField || !getButton() || isPanelOpen()) return;
  setButtonMode(detectMode(activeField));
}

function handleReposition() {
  if (!activeField || !getButton()) return;
  positionButton(activeField);
}

const WATCHED_KEYS = ["enableInlineButton", "inlineMessageType", "inlineClickMode", "model", "replyConsent", "savedPrompts", "snippets"];

async function init() {
  await loadSettings();
  injectStyles();
  document.addEventListener("focus", handleFocus, true);
  document.addEventListener("blur", handleBlur, true);
  document.addEventListener("input", handleInput, true);
  document.addEventListener("selectionchange", handleSelectionChange);
  window.addEventListener("scroll", handleReposition, true);
  window.addEventListener("resize", handleReposition);

  // storage.onChanged avoids needing tabs.sendMessage host_permissions.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let touched = false;
    for (const key of WATCHED_KEYS) {
      if (!(key in changes)) continue;
      const newValue = changes[key].newValue;
      settings[key] = newValue !== undefined ? newValue : DEFAULT_SETTINGS[key];
      touched = true;
    }
    if (touched && !isPanelOpen()) {
      if (!settings.enableInlineButton) { closePanel(); removeButton(); activeField = null; }
      else if (activeField) showButtonFor(activeField);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
