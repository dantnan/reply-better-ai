import browser from "../lib/browser.js";
import { storage, migrateFromSync, setSelectedModel } from "../lib/storage.js";
import { validateApiKey } from "../lib/openrouter.js";
import { getModels } from "../lib/models-cache.js";
import { DEFAULT_MODEL, DEFAULT_STYLE } from "../lib/constants.js";
import { ModelPicker } from "../popup/components/ModelPicker.js";
import { fillStyleSelect, renderModelChip, managerItem } from "../popup/components/settings-ui.js";

const $ = id => document.getElementById(id);

const els = {
  saved: $("opt-saved"),
  nav: $("opt-nav"),
  apiKey: $("api-key"),
  keyToggle: $("key-toggle"),
  saveKey: $("save-key"),
  keyError: $("key-error"), keyErrorText: $("key-error-text"),
  chipAvatar: $("chip-avatar"),
  modelName: $("model-display-name"),
  modelMeta: $("model-display-meta"),
  openPicker: $("open-picker"),
  enableInline: $("enable-inline-button"),
  inlineStyle: $("inline-message-type"),
  promptsList: $("prompts-list"),
  newPromptName: $("new-prompt-name"),
  customPrompt: $("custom-prompt"),
  saveCustomPrompt: $("save-custom-prompt"),
  snippetsList: $("snippets-list"),
  newSnippetTrigger: $("new-snippet-trigger"),
  newSnippetContent: $("new-snippet-content"),
  saveSnippet: $("save-snippet"),
  modal: $("picker-modal"),
  pickerContainer: $("model-picker-container"),
};

const state = { savedPrompts: [], snippets: [], modelsCache: [], currentModelId: DEFAULT_MODEL };

let savedTimer;
function flashSaved() {
  els.saved.classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => els.saved.classList.remove("show"), 1600);
}

function refreshChip() {
  renderModelChip({
    avatarEl: els.chipAvatar, nameEl: els.modelName, metaEl: els.modelMeta,
    models: state.modelsCache, currentModelId: state.currentModelId,
    emptyHint: "Click Change to load models",
  });
}

function showKeyError(msg) {
  els.keyErrorText.textContent = msg;
  els.keyError.classList.add("show");
}

// Persist + confirm only on success — never flash "Saved" for a write that
// rejected, or the toggle silently reverts on reopen and the user is misled.
async function persist(values) {
  try { await storage.set(values); flashSaved(); }
  catch { showKeyError("Couldn't save — try again."); }
}

function renderPrompts() {
  els.promptsList.replaceChildren();
  state.savedPrompts.forEach((p, index) => {
    els.promptsList.appendChild(managerItem(p.name, p.text, {
      onEdit: () => { els.newPromptName.value = p.name; els.customPrompt.value = p.text; els.saveCustomPrompt.dataset.edit = String(index); els.saveCustomPrompt.textContent = "Update"; },
      onDelete: async () => {
        state.savedPrompts.splice(index, 1);
        await storage.set({ savedPrompts: state.savedPrompts });
        renderPrompts();
        fillStyleSelect(els.inlineStyle, state.savedPrompts, els.inlineStyle.value);
        flashSaved();
      },
    }));
  });
}

function renderSnippets() {
  els.snippetsList.replaceChildren();
  state.snippets.forEach((s, index) => {
    els.snippetsList.appendChild(managerItem(s.trigger, s.content, {
      onEdit: () => { els.newSnippetTrigger.value = s.trigger; els.newSnippetContent.value = s.content; els.saveSnippet.dataset.edit = String(index); els.saveSnippet.textContent = "Update"; },
      onDelete: async () => {
        state.snippets.splice(index, 1);
        await storage.set({ snippets: state.snippets });
        renderSnippets();
        flashSaved();
      },
    }));
  });
}

function openPicker() {
  els.modal.classList.add("show");
  const picker = new ModelPicker({
    container: els.pickerContainer,
    currentModelId: state.currentModelId,
    onSelect: async model => {
      state.currentModelId = model.id;
      if (state.modelsCache.length === 0 && picker.models?.length) state.modelsCache = picker.models;
      await setSelectedModel(model.id);
      closePicker();
      refreshChip();
      flashSaved();
    },
    onClose: () => closePicker(),
  });
  picker.open();
}
function closePicker() {
  els.modal.classList.remove("show");
  els.pickerContainer.replaceChildren();
}

function setupScrollSpy() {
  const links = [...els.nav.querySelectorAll("a")];
  const byId = new Map(links.map(a => [a.dataset.target, a]));
  const observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) {
        links.forEach(a => a.classList.remove("active"));
        byId.get(e.target.id)?.classList.add("active");
      }
    }
  }, { rootMargin: "-88px 0px -60% 0px", threshold: 0 });
  for (const a of links) {
    const card = document.getElementById(a.dataset.target);
    if (card) observer.observe(card);
  }
}

async function saveKey() {
  const key = els.apiKey.value.trim();
  els.keyError.classList.remove("show");
  if (!key) { showKeyError("Enter an API key."); return; }
  els.saveKey.disabled = true;
  els.saveKey.textContent = "Validating…";
  try {
    const result = await validateApiKey(key);
    if (!result.ok && result.reason === "invalid") throw new Error("API key invalid. Check it at openrouter.ai/keys.");
    await storage.set({ apiKey: key });
    flashSaved();
  } catch (e) {
    showKeyError(e.message);
  } finally {
    els.saveKey.disabled = false;
    els.saveKey.textContent = "Save key";
  }
}

async function init() {
  await migrateFromSync();
  const data = await storage.get([
    "apiKey", "model", "savedPrompts", "snippets", "enableInlineButton", "inlineMessageType", "inlineClickMode",
  ]);
  state.savedPrompts = Array.isArray(data.savedPrompts) ? data.savedPrompts : [];
  state.snippets = Array.isArray(data.snippets) ? data.snippets : [];
  state.currentModelId = data.model || DEFAULT_MODEL;
  if (data.apiKey) els.apiKey.value = data.apiKey;
  els.enableInline.checked = data.enableInlineButton !== false;
  const clickMode = data.inlineClickMode || "panel";
  const clickRadio = document.querySelector(`#inline-click-mode input[value="${clickMode}"]`);
  if (clickRadio) clickRadio.checked = true;
  fillStyleSelect(els.inlineStyle, state.savedPrompts, data.inlineMessageType || DEFAULT_STYLE);
  renderPrompts();
  renderSnippets();
  refreshChip();

  try {
    const result = await getModels();
    state.modelsCache = result.models;
    refreshChip();
  } catch (e) {
    console.warn("[options] models load failed:", e?.message);
  }

  setupScrollSpy();

  // nav smooth scroll
  els.nav.addEventListener("click", e => {
    const a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.keyToggle.addEventListener("click", () => { els.apiKey.type = els.apiKey.type === "password" ? "text" : "password"; });
  els.saveKey.addEventListener("click", saveKey);
  els.openPicker.addEventListener("click", openPicker);
  els.modal.addEventListener("click", e => { if (e.target === els.modal) closePicker(); });
  els.enableInline.addEventListener("change", () => persist({ enableInlineButton: els.enableInline.checked }));
  els.inlineStyle.addEventListener("change", () => persist({ inlineMessageType: els.inlineStyle.value }));
  for (const radio of document.querySelectorAll('#inline-click-mode input[name="click-mode"]')) {
    radio.addEventListener("change", () => { if (radio.checked) persist({ inlineClickMode: radio.value }); });
  }

  els.saveCustomPrompt.addEventListener("click", async () => {
    const name = els.newPromptName.value.trim();
    const text = els.customPrompt.value.trim();
    if (!name || !text) { showKeyError("Enter both a name and the instruction."); return; }
    const edit = els.saveCustomPrompt.dataset.edit;
    if (edit !== undefined) { state.savedPrompts[Number(edit)] = { name, text }; delete els.saveCustomPrompt.dataset.edit; els.saveCustomPrompt.textContent = "Add"; }
    else state.savedPrompts.push({ name, text });
    await storage.set({ savedPrompts: state.savedPrompts });
    els.newPromptName.value = ""; els.customPrompt.value = "";
    renderPrompts();
    fillStyleSelect(els.inlineStyle, state.savedPrompts, els.inlineStyle.value);
    flashSaved();
  });

  els.saveSnippet.addEventListener("click", async () => {
    const trigger = els.newSnippetTrigger.value.trim();
    const content = els.newSnippetContent.value.trim();
    if (!trigger || !content) { showKeyError("Enter both a trigger and content."); return; }
    const edit = els.saveSnippet.dataset.edit;
    if (edit !== undefined) { state.snippets[Number(edit)] = { trigger, content }; delete els.saveSnippet.dataset.edit; els.saveSnippet.textContent = "Add"; }
    else {
      const existing = state.snippets.findIndex(s => s.trigger === trigger);
      if (existing >= 0) state.snippets[existing] = { trigger, content };
      else state.snippets.push({ trigger, content });
    }
    await storage.set({ snippets: state.snippets });
    els.newSnippetTrigger.value = ""; els.newSnippetContent.value = "";
    renderSnippets();
    flashSaved();
  });
}

init().catch(e => console.error("[options] init failed:", e));
