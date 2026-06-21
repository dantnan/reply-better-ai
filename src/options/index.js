import browser from "../lib/browser.js";
import { storage, migrateFromSync, setSelectedModel } from "../lib/storage.js";
import { validateApiKey, getKeyInfo } from "../lib/openrouter.js";
import { getModels } from "../lib/models-cache.js";
import { DEFAULT_MODEL, DEFAULT_STYLE, LOCAL_PRESETS } from "../lib/constants.js";
import { describeActiveEngine } from "../engines/index.js";
import { listLocalModels } from "../engines/local.js";
import { ModelPicker } from "../popup/components/ModelPicker.js";
import { fillStyleSelect, renderModelChip, managerItem } from "../popup/components/settings-ui.js";

const $ = id => document.getElementById(id);

const els = {
  saved: $("opt-saved"),
  nav: $("opt-nav"),
  engineSelect: $("engine-select"),
  activeEngineLabel: $("active-engine-label"),
  engineQuota: $("engine-quota"),
  groqApiKey: $("groq-api-key"),
  groqKeyToggle: $("groq-key-toggle"),
  localPresets: $("local-presets"),
  localBaseUrl: $("local-base-url"),
  localModel: $("local-model"),
  localRefresh: $("local-refresh"),
  localStatus: $("local-status"),
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

/* ── Local server (Ollama / LM Studio / OpenAI-compatible) ───────────── */

// Highlight the preset button whose URL matches the current base URL (or the
// explicitly-saved preset for the ambiguous "custom == a preset URL" case).
function highlightPreset(preset) {
  for (const btn of els.localPresets.querySelectorAll("button[data-preset]")) {
    btn.classList.toggle("rb-btn-primary", btn.dataset.preset === preset);
    btn.classList.toggle("rb-btn-secondary", btn.dataset.preset !== preset);
  }
}

function presetFromUrl(url) {
  const hit = Object.entries(LOCAL_PRESETS).find(([, p]) => p.baseUrl && p.baseUrl === url);
  return hit ? hit[0] : "custom";
}

function fillLocalModelSelect(models, selectedId) {
  els.localModel.replaceChildren();
  if (!models.length) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "No models found";
    els.localModel.appendChild(opt);
    els.localModel.disabled = true;
    return;
  }
  els.localModel.disabled = false;
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m.id; opt.textContent = m.id;
    els.localModel.appendChild(opt);
  }
  // Keep the stored model if it's still installed; otherwise default to the first.
  els.localModel.value = models.some(m => m.id === selectedId) ? selectedId : models[0].id;
}

// The only reachability probe — user-initiated, off the hot path. Distinguishes
// "can't reach" from "reachable but empty"; CORS-vs-refused can't be told apart
// from a thrown TypeError, so both fold into one actionable message.
async function refreshLocalModels({ persistSelection = false } = {}) {
  const baseUrl = els.localBaseUrl.value.trim();
  if (!baseUrl) {
    els.localStatus.textContent = "Enter a base URL to connect.";
    fillLocalModelSelect([], "");
    return;
  }
  els.localStatus.textContent = "Connecting…";
  const { localModel } = await storage.get(["localModel"]);
  try {
    const models = await listLocalModels(baseUrl);
    fillLocalModelSelect(models, localModel);
    els.localStatus.textContent = models.length
      ? `● Connected · ${models.length} model${models.length === 1 ? "" : "s"}`
      : "○ Reachable, but no models are available. Pull a model (Ollama) or load one (LM Studio).";
    if (models.length && (persistSelection || els.localModel.value !== localModel)) {
      await persist({ localModel: els.localModel.value });
    }
  } catch {
    fillLocalModelSelect([], "");
    els.localStatus.textContent = "○ Can't reach the server. Check it's running and that CORS is enabled — see the setup guide.";
  }
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
    updateActiveEngineLabel();
  } catch (e) {
    showKeyError(e.message);
  } finally {
    els.saveKey.disabled = false;
    els.saveKey.textContent = "Save key";
  }
}

async function updateActiveEngineLabel() {
  let d = null;
  try { d = await describeActiveEngine(); } catch { /* keep null */ }
  els.activeEngineLabel.textContent = d ? d.label : "—";
  try { els.engineQuota.textContent = await engineQuotaText(d); }
  catch (e) { console.warn("[options] quota text failed:", e?.message); els.engineQuota.textContent = ""; }
}

async function engineQuotaText(d) {
  if (!d) return "";
  if (d.id === "ondevice") return "No usage limit — runs on your device.";
  if (d.id === "groq") {
    const { groqQuota } = await storage.get(["groqQuota"]);
    if (groqQuota && Number.isFinite(groqQuota.remaining)) {
      return `≈${groqQuota.remaining} requests available right now (Groq free tier; refills continuously, as of last use).`;
    }
    return "Use it once to see your remaining requests.";
  }
  if (d.id === "openrouter") {
    const { apiKey } = await storage.get(["apiKey"]);
    const info = await getKeyInfo(apiKey);
    if (info && info.limit_remaining != null) return `≈$${Number(info.limit_remaining).toFixed(2)} of credits left.`;
    if (info && info.is_free_tier) return "Free tier — limited daily :free requests.";
    return "";
  }
  return "";
}

async function init() {
  await migrateFromSync();
  const data = await storage.get([
    "apiKey", "groqApiKey", "engine", "model", "savedPrompts", "snippets", "enableInlineButton", "inlineMessageType", "inlineClickMode",
    "localBaseUrl", "localModel", "localPreset",
  ]);
  state.savedPrompts = Array.isArray(data.savedPrompts) ? data.savedPrompts : [];
  state.snippets = Array.isArray(data.snippets) ? data.snippets : [];
  state.currentModelId = data.model || DEFAULT_MODEL;
  if (data.apiKey) els.apiKey.value = data.apiKey;
  els.engineSelect.value = data.engine || "auto";
  if (data.groqApiKey) els.groqApiKey.value = data.groqApiKey;
  els.localBaseUrl.value = data.localBaseUrl || "";
  highlightPreset(data.localPreset || presetFromUrl(data.localBaseUrl || ""));
  if (data.localBaseUrl) refreshLocalModels();
  else els.localStatus.textContent = "Enter a base URL to connect.";
  els.enableInline.checked = data.enableInlineButton !== false;
  const clickMode = data.inlineClickMode || "panel";
  const clickRadio = document.querySelector(`#inline-click-mode input[value="${clickMode}"]`);
  if (clickRadio) clickRadio.checked = true;
  fillStyleSelect(els.inlineStyle, state.savedPrompts, data.inlineMessageType || DEFAULT_STYLE);
  renderPrompts();
  renderSnippets();
  refreshChip();
  updateActiveEngineLabel();

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

  els.engineSelect.addEventListener("change", async () => {
    await persist({ engine: els.engineSelect.value });
    updateActiveEngineLabel();
    refreshChip();
  });
  els.groqApiKey.addEventListener("change", async () => {
    await persist({ groqApiKey: els.groqApiKey.value.trim() });
    updateActiveEngineLabel();
  });
  els.groqKeyToggle.addEventListener("click", () => { els.groqApiKey.type = els.groqApiKey.type === "password" ? "text" : "password"; });

  els.localPresets.addEventListener("click", async e => {
    const btn = e.target.closest("button[data-preset]");
    if (!btn) return;
    const preset = btn.dataset.preset;
    const url = LOCAL_PRESETS[preset]?.baseUrl ?? "";
    els.localBaseUrl.value = url;
    highlightPreset(preset);
    await persist({ localPreset: preset, localBaseUrl: url });
    refreshLocalModels();
  });
  els.localBaseUrl.addEventListener("change", async () => {
    const url = els.localBaseUrl.value.trim();
    const preset = presetFromUrl(url);
    highlightPreset(preset);
    await persist({ localBaseUrl: url, localPreset: preset });
    refreshLocalModels();
  });
  els.localModel.addEventListener("change", () => { if (els.localModel.value) persist({ localModel: els.localModel.value }); });
  els.localRefresh.addEventListener("click", () => refreshLocalModels({ persistSelection: true }));
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
