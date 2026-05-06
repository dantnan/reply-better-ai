import browser from "../lib/browser.js";
import { storage } from "../lib/storage.js";
import { isTextInput, readText, writeText } from "./text-target.js";
import { injectStyles, createButton, findButtonFor, removeButtonFor, removeAllButtons, showToast } from "./button-injector.js";
import { tryExpandSnippet } from "./snippet-expander.js";

const settings = {
  enableInlineButton: true,
  inlineMessageType: "professional",
  showTypeIndicator: true,
  savedPrompts: [],
  snippets: [],
};

let activeElement = null;

async function loadSettings() {
  try {
    const stored = await storage.get([
      "enableInlineButton", "inlineMessageType", "showTypeIndicator", "savedPrompts", "snippets",
    ]);
    if (stored.enableInlineButton !== undefined) settings.enableInlineButton = stored.enableInlineButton;
    if (stored.inlineMessageType) settings.inlineMessageType = stored.inlineMessageType;
    if (stored.showTypeIndicator !== undefined) settings.showTypeIndicator = stored.showTypeIndicator;
    if (Array.isArray(stored.savedPrompts)) settings.savedPrompts = stored.savedPrompts;
    if (Array.isArray(stored.snippets)) settings.snippets = stored.snippets;
  } catch (e) {
    console.warn("[content] settings load failed:", e.message);
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
    } else {
      button.classList.add("error");
      showToast("Boş yanıt alındı.", { type: "error" });
    }
  } catch (err) {
    console.error("[content] improve failed:", err);
    button.classList.add("error");
    let msg = err.message || "Beklenmeyen hata.";
    if (msg.includes("Receiving end does not exist")) {
      msg = "Eklenti yeniden yükleniyor olabilir. Sayfayı yenile ve tekrar dene.";
    } else if (msg.includes("timed out")) {
      msg = "İstek zaman aşımına uğradı. AI servisi meşgul olabilir, tekrar dene.";
    }
    showToast(msg, { type: "error" });
  } finally {
    button.classList.remove("processing");
    setTimeout(() => button.classList.remove("error"), 2000);
  }
}

function sendMessage(payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => reject(new Error(`Message ${id} timed out after ${timeoutMs}ms`)), timeoutMs);
    browser.runtime.sendMessage({ ...payload, _id: id })
      .then(response => {
        clearTimeout(timer);
        if (response === undefined || response === null) {
          reject(new Error(`Empty response for message ${id}`));
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

async function init() {
  await loadSettings();
  injectStyles();
  document.addEventListener("focus", handleFocus, true);
  document.addEventListener("blur", handleBlur, true);
  document.addEventListener("input", handleInput, true);
  window.addEventListener("resize", handleResize);

  browser.runtime.onMessage.addListener(message => {
    if (message?.action === "updateSettings" && message.settings) {
      Object.assign(settings, message.settings);
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
