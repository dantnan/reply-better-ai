import browser from "../lib/browser.js";
import { storage, migrateFromSync } from "../lib/storage.js";
import { validateApiKey, improveText } from "../lib/openrouter.js";
import { resolveSystemPrompt } from "../lib/system-prompts.js";
import { CUSTOM_PROMPT_PREFIX, DEFAULT_MODEL, MAX_INPUT_LENGTH } from "../lib/constants.js";
import { getModels, formatPrice, formatContextLength } from "../lib/models-cache.js";
import { ModelPicker } from "./components/ModelPicker.js";

const $ = (id) => document.getElementById(id);

const elements = {
  firstTimeSetup: $("first-time-setup"),
  mainInterface: $("main-interface"),
  settingsPanel: $("settings-panel"),
  showSettings: $("show-settings"),
  openOptions: $("open-options"),
  saveSettings: $("save-settings"),
  firstTimeSave: $("first-time-save"),
  firstTimeApiKey: $("first-time-api-key"),
  apiKey: $("api-key"),
  messageTypeSelect: $("message-type-select"),
  customPrompt: $("custom-prompt"),
  newPromptName: $("new-prompt-name"),
  saveCustomPrompt: $("save-custom-prompt"),
  promptsList: document.querySelector(".prompts-list-container"),
  closePopup: $("close-popup"),
  inputText: $("input-text"),
  outputText: $("output-text"),
  improveText: $("improve-text"),
  copyToClipboard: $("copy-to-clipboard"),
  charCount: $("char-count"),
  enableInlineButton: $("enable-inline-button"),
  inlineMessageType: $("inline-message-type"),
  showTypeIndicator: $("show-type-indicator"),
  newSnippetTrigger: $("new-snippet-trigger"),
  newSnippetContent: $("new-snippet-content"),
  saveSnippet: $("save-snippet"),
  snippetsList: document.querySelector(".snippets-list-container"),
  statusBanner: $("status-banner"),
  modelDisplayName: $("model-display-name"),
  modelDisplayMeta: $("model-display-meta"),
  openPicker: $("open-picker"),
  pickerContainer: $("model-picker-container"),
  modelFallbackBanner: $("model-fallback-banner"),
};

let savedPrompts = [];
let snippets = [];
let currentModelId = DEFAULT_MODEL;
let modelsCache = []; // last fetched list, used to render the model display chip
let picker = null;

function showBanner(message, type = "info") {
  elements.statusBanner.textContent = message;
  elements.statusBanner.className = type;
  elements.statusBanner.classList.remove("hidden");
}

function hideBanner() {
  elements.statusBanner.classList.add("hidden");
}

function refreshPromptsDropdowns() {
  for (const dropdown of [elements.messageTypeSelect, elements.inlineMessageType]) {
    if (!dropdown) continue;
    for (let i = dropdown.options.length - 1; i >= 0; i--) {
      if (dropdown.options[i].value.startsWith(CUSTOM_PROMPT_PREFIX)) dropdown.remove(i);
    }
    if (savedPrompts.length === 0) continue;
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "──────────────";
    dropdown.appendChild(sep);
    savedPrompts.forEach((prompt, idx) => {
      const option = document.createElement("option");
      option.value = `${CUSTOM_PROMPT_PREFIX}${idx}`;
      option.textContent = prompt.name;
      dropdown.appendChild(option);
    });
  }
}

function renderSavedPrompts() {
  elements.promptsList.replaceChildren();
  if (savedPrompts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "no-prompts";
    empty.textContent = "No saved prompts yet";
    elements.promptsList.appendChild(empty);
    return;
  }
  savedPrompts.forEach((prompt, index) => {
    const item = document.createElement("div");
    item.className = "prompt-item";

    const name = document.createElement("div");
    name.className = "prompt-item-name";
    name.textContent = prompt.name;

    const actions = document.createElement("div");
    actions.className = "prompt-item-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "✏️";
    editBtn.title = "Edit";
    editBtn.addEventListener("click", () => {
      elements.customPrompt.value = prompt.text;
      elements.newPromptName.value = prompt.name;
      elements.saveCustomPrompt.dataset.editIndex = String(index);
      elements.saveCustomPrompt.textContent = "Update Prompt";
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "🗑️";
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Delete prompt "${prompt.name}"?`)) return;
      savedPrompts.splice(index, 1);
      await storage.set({ savedPrompts });
      renderSavedPrompts();
      refreshPromptsDropdowns();
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(name);
    item.appendChild(actions);
    elements.promptsList.appendChild(item);
  });
}

function renderSavedSnippets() {
  if (!elements.snippetsList) return;
  elements.snippetsList.replaceChildren();
  if (snippets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "no-snippets";
    empty.textContent = "No saved snippets yet";
    elements.snippetsList.appendChild(empty);
    return;
  }
  snippets.forEach((snippet, index) => {
    const item = document.createElement("div");
    item.className = "snippet-item";

    const trigger = document.createElement("div");
    trigger.className = "snippet-item-trigger";
    trigger.textContent = snippet.trigger;

    const content = document.createElement("div");
    content.className = "snippet-item-content";
    content.textContent = snippet.content;
    content.title = snippet.content;

    const actions = document.createElement("div");
    actions.className = "snippet-item-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "✏️";
    editBtn.title = "Edit";
    editBtn.addEventListener("click", () => {
      elements.newSnippetTrigger.value = snippet.trigger;
      elements.newSnippetContent.value = snippet.content;
      elements.saveSnippet.dataset.editIndex = String(index);
      elements.saveSnippet.textContent = "Update Snippet";
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "🗑️";
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Delete snippet "${snippet.trigger}"?`)) return;
      snippets.splice(index, 1);
      await storage.set({ snippets });
      renderSavedSnippets();
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(trigger);
    item.appendChild(content);
    item.appendChild(actions);
    elements.snippetsList.appendChild(item);
  });
}

// Content scripts pick up settings changes via storage.onChanged — no broadcast needed.

function renderModelDisplay() {
  const model = modelsCache.find(m => m.id === currentModelId);
  if (model) {
    elements.modelDisplayName.textContent = model.name || model.id;
    elements.modelDisplayMeta.textContent = `${model.id} · ${formatContextLength(model)} · ${formatPrice(model)}`;
  } else {
    elements.modelDisplayName.textContent = currentModelId || DEFAULT_MODEL;
    elements.modelDisplayMeta.textContent = modelsCache.length === 0 ? "Tap Change to load model list" : "(not in current list)";
  }
}

async function ensureModels() {
  if (modelsCache.length > 0) return;
  try {
    const result = await getModels();
    modelsCache = result.models;
    if (result.stale) {
      showBanner("Showing a cached model list — couldn't reach OpenRouter.", "info");
    }
    renderModelDisplay();
  } catch (err) {
    console.warn("[popup] could not load models:", err?.message);
    showBanner("Couldn't reach OpenRouter to load the model list.", "error");
  }
}

async function showFallbackBannerIfNeeded() {
  const { modelFallbackNotice } = await storage.get(["modelFallbackNotice"]);
  if (!modelFallbackNotice) return;
  const banner = elements.modelFallbackBanner;
  banner.replaceChildren();
  const text = document.createElement("div");
  text.textContent = `Selected model "${modelFallbackNotice.from}" is no longer available. Switched to "${modelFallbackNotice.to}".`;
  banner.appendChild(text);
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", async () => {
    await storage.remove("modelFallbackNotice");
    banner.classList.add("hidden");
  });
  banner.appendChild(dismiss);
  banner.classList.remove("hidden");
}

function openPicker() {
  elements.pickerContainer.classList.remove("hidden");
  hideMainSections();
  picker = new ModelPicker({
    container: elements.pickerContainer,
    currentModelId,
    onSelect: async (model) => {
      currentModelId = model.id;
      await storage.set({ model: model.id });
      closePicker();
      renderModelDisplay();
      showBanner(`Model set to ${model.name || model.id}`, "success");
      setTimeout(hideBanner, 2000);
    },
    onClose: () => closePicker(),
  });
  picker.open();
}

function closePicker() {
  elements.pickerContainer.classList.add("hidden");
  elements.pickerContainer.replaceChildren();
  picker = null;
  showMainSections();
}

function hideMainSections() {
  document.querySelector(".message-type")?.classList.add("hidden");
  document.querySelector(".editor")?.classList.add("hidden");
  document.querySelector(".footer")?.classList.add("hidden");
  document.querySelector(".settings-toggle")?.classList.add("hidden");
  elements.settingsPanel.classList.add("hidden");
}

function showMainSections() {
  document.querySelector(".message-type")?.classList.remove("hidden");
  document.querySelector(".editor")?.classList.remove("hidden");
  document.querySelector(".footer")?.classList.remove("hidden");
  document.querySelector(".settings-toggle")?.classList.remove("hidden");
}

async function loadAll() {
  await migrateFromSync();
  const data = await storage.get([
    "apiKey", "model", "messageType", "customPrompt", "savedPrompts", "snippets",
    "enableInlineButton", "inlineMessageType", "showTypeIndicator",
  ]);
  savedPrompts = Array.isArray(data.savedPrompts) ? data.savedPrompts : [];
  snippets = Array.isArray(data.snippets) ? data.snippets : [];
  currentModelId = data.model || DEFAULT_MODEL;
  renderSavedPrompts();
  renderSavedSnippets();
  refreshPromptsDropdowns();
  renderModelDisplay();
  ensureModels();
  showFallbackBannerIfNeeded();

  if (!data.apiKey) {
    elements.firstTimeSetup.classList.remove("hidden");
    elements.mainInterface.classList.add("hidden");
    return;
  }
  elements.firstTimeSetup.classList.add("hidden");
  elements.mainInterface.classList.remove("hidden");
  elements.apiKey.value = data.apiKey;

  if (data.messageType) elements.messageTypeSelect.value = data.messageType;
  if (data.customPrompt) elements.customPrompt.value = data.customPrompt;
  if (data.enableInlineButton !== undefined) elements.enableInlineButton.checked = data.enableInlineButton;
  if (data.inlineMessageType) elements.inlineMessageType.value = data.inlineMessageType;
  if (data.showTypeIndicator !== undefined) elements.showTypeIndicator.checked = data.showTypeIndicator;
}

elements.closePopup.addEventListener("click", () => window.close());

elements.openOptions.addEventListener("click", () => {
  browser.runtime.openOptionsPage().catch(err => showBanner(`Cannot open options: ${err.message}`, "error"));
});

elements.openPicker.addEventListener("click", openPicker);

elements.showSettings.addEventListener("click", () => {
  elements.settingsPanel.classList.remove("hidden");
  document.querySelector(".message-type")?.classList.add("hidden");
  document.querySelector(".editor")?.classList.add("hidden");
  document.querySelector(".footer")?.classList.add("hidden");
  document.querySelector(".settings-toggle")?.classList.add("hidden");
});

elements.firstTimeSave.addEventListener("click", async () => {
  const apiKey = elements.firstTimeApiKey.value.trim();
  if (!apiKey) {
    showBanner("Please enter a valid API key.", "error");
    return;
  }
  elements.firstTimeSave.disabled = true;
  elements.firstTimeSave.textContent = "Validating...";
  try {
    const result = await validateApiKey(apiKey);
    if (!result.ok) {
      if (result.reason === "invalid") throw new Error("API key invalid. Check it at openrouter.ai/keys.");
      if (result.reason === "timeout" || result.reason === "network") throw new Error("Couldn't reach OpenRouter. Saving the key anyway — try again later.");
      throw new Error(`OpenRouter returned ${result.status}. Try again later.`);
    }
    await storage.set({
      apiKey,
      model: currentModelId,
      messageType: "professional",
    });
    elements.firstTimeSetup.classList.add("hidden");
    elements.mainInterface.classList.remove("hidden");
    elements.apiKey.value = apiKey;
    showBanner("API key saved.", "success");
    ensureModels();
  } catch (e) {
    // Network failure path: still save the key so the user isn't locked out offline.
    if (/Couldn't reach OpenRouter/.test(e.message)) {
      await storage.set({ apiKey, model: currentModelId, messageType: "professional" });
      elements.firstTimeSetup.classList.add("hidden");
      elements.mainInterface.classList.remove("hidden");
      elements.apiKey.value = apiKey;
    }
    showBanner(e.message, "error");
  } finally {
    elements.firstTimeSave.disabled = false;
    elements.firstTimeSave.textContent = "Save API Key";
  }
});

elements.saveSettings.addEventListener("click", async () => {
  const apiKey = elements.apiKey.value.trim();
  if (!apiKey) {
    showBanner("Please enter a valid API key.", "error");
    return;
  }
  elements.saveSettings.disabled = true;
  elements.saveSettings.textContent = "Saving...";
  const persist = () => storage.set({
    apiKey,
    messageType: elements.messageTypeSelect.value,
    customPrompt: elements.customPrompt.value,
    enableInlineButton: elements.enableInlineButton.checked,
    inlineMessageType: elements.inlineMessageType.value,
    showTypeIndicator: elements.showTypeIndicator.checked,
    snippets,
  });
  try {
    const result = await validateApiKey(apiKey);
    if (!result.ok) {
      if (result.reason === "invalid") throw new Error("API key invalid. Check it at openrouter.ai/keys.");
      if (result.reason === "timeout" || result.reason === "network") {
        await persist();
        showBanner("Couldn't reach OpenRouter — saved settings anyway.", "info");
        return;
      }
      throw new Error(`OpenRouter returned ${result.status}. Try again later.`);
    }
    await persist();
    elements.settingsPanel.classList.add("hidden");
    showMainSections();
    showBanner("Settings saved.", "success");
    setTimeout(hideBanner, 2000);
  } catch (e) {
    showBanner(e.message, "error");
  } finally {
    elements.saveSettings.disabled = false;
    elements.saveSettings.textContent = "Save Settings";
  }
});

elements.saveCustomPrompt.addEventListener("click", async () => {
  const text = elements.customPrompt.value.trim();
  const name = elements.newPromptName.value.trim();
  if (!text || !name) {
    showBanner("Enter both a name and the prompt text.", "error");
    return;
  }
  const editIndex = elements.saveCustomPrompt.dataset.editIndex;
  if (editIndex !== undefined) {
    savedPrompts[Number(editIndex)] = { name, text };
    delete elements.saveCustomPrompt.dataset.editIndex;
    elements.saveCustomPrompt.textContent = "Create Custom Prompt";
  } else {
    savedPrompts.push({ name, text });
  }
  await storage.set({ savedPrompts });
  renderSavedPrompts();
  refreshPromptsDropdowns();
  elements.customPrompt.value = "";
  elements.newPromptName.value = "";
  showBanner("Prompt saved.", "success");
  setTimeout(hideBanner, 2000);
});

elements.saveSnippet.addEventListener("click", async () => {
  const trigger = elements.newSnippetTrigger.value.trim();
  const content = elements.newSnippetContent.value.trim();
  if (!trigger || !content) {
    showBanner("Enter both a trigger and content.", "error");
    return;
  }
  const editIndex = elements.saveSnippet.dataset.editIndex;
  if (editIndex !== undefined) {
    snippets[Number(editIndex)] = { trigger, content };
    delete elements.saveSnippet.dataset.editIndex;
    elements.saveSnippet.textContent = "Create Snippet";
  } else {
    const existingIdx = snippets.findIndex(s => s.trigger === trigger);
    if (existingIdx >= 0) {
      if (!confirm(`Snippet with trigger "${trigger}" exists. Replace it?`)) return;
      snippets[existingIdx] = { trigger, content };
    } else {
      snippets.push({ trigger, content });
    }
  }
  await storage.set({ snippets });
  renderSavedSnippets();
  elements.newSnippetTrigger.value = "";
  elements.newSnippetContent.value = "";
  showBanner("Snippet saved.", "success");
  setTimeout(hideBanner, 2000);
});

elements.inputText.addEventListener("input", () => {
  elements.charCount.textContent = `${elements.inputText.value.length} characters`;
});

elements.improveText.addEventListener("click", async () => {
  const text = elements.inputText.value.trim();
  if (!text) {
    showBanner("Please enter a message to improve.", "error");
    return;
  }
  if (text.length > MAX_INPUT_LENGTH) {
    showBanner(`Text is too long (max ${MAX_INPUT_LENGTH} characters).`, "error");
    return;
  }
  const data = await storage.get(["apiKey", "model", "savedPrompts"]);
  if (!data.apiKey) {
    showBanner("Set your OpenRouter API key in settings first.", "error");
    elements.settingsPanel.classList.remove("hidden");
    return;
  }
  elements.improveText.disabled = true;
  elements.improveText.textContent = "Processing...";
  elements.outputText.value = "Improving your message...";
  try {
    const systemPrompt = resolveSystemPrompt(elements.messageTypeSelect.value, data.savedPrompts || []);
    const improved = await improveText({
      text,
      apiKey: data.apiKey,
      model: data.model || currentModelId,
      systemPrompt,
    });
    elements.outputText.value = improved;
  } catch (e) {
    elements.outputText.value = "";
    showBanner(e.userMessage || e.message, "error");
  } finally {
    elements.improveText.disabled = false;
    elements.improveText.textContent = "Improve Message";
  }
});

elements.copyToClipboard.addEventListener("click", async () => {
  const value = elements.outputText.value;
  if (!value) return;
  const original = elements.copyToClipboard.textContent;
  try {
    await navigator.clipboard.writeText(value);
    elements.copyToClipboard.textContent = "Copied!";
  } catch {
    elements.outputText.select();
    document.execCommand("copy");
    elements.copyToClipboard.textContent = "Copied!";
  }
  setTimeout(() => { elements.copyToClipboard.textContent = original; }, 1500);
});

loadAll().catch(err => showBanner(`Load error: ${err.message}`, "error"));
