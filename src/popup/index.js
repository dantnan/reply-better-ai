import browser from "../lib/browser.js";
import { storage, migrateFromSync, setSelectedModel } from "../lib/storage.js";
import { validateApiKey, streamImproveText } from "../lib/openrouter.js";
import { resolveSystemPrompt, STYLES, styleLabel } from "../lib/system-prompts.js";
import { CUSTOM_PROMPT_PREFIX, DEFAULT_MODEL, DEFAULT_STYLE, MAX_INPUT_LENGTH } from "../lib/constants.js";
import {
  getModels, isFree, formatContextLength, pricePerMTok, formatUsd,
  getProviderColor, getProviderMonogram, getProviderLabel,
} from "../lib/models-cache.js";
import { diffWords } from "../lib/diff.js";
import { ModelPicker } from "./components/ModelPicker.js";

const $ = id => document.getElementById(id);

const popup = $("rb-popup");
const els = {
  settingsToggle: $("settings-toggle"),
  openOptions: $("open-options"),
  closePopup: $("close-popup"),
  // banners
  statusBanner: $("status-banner"), statusText: $("status-banner-text"),
  fallbackBanner: $("model-fallback-banner"), fallbackText: $("model-fallback-text"),
  errorBanner: $("error-banner"), errorText: $("error-banner-text"),
  // setup
  setupCta: $("setup-cta"),
  // main
  styleSelect: $("message-type"),
  input: $("improve-text"),
  counter: $("char-counter"),
  improveBtn: $("improve-btn"),
  output: $("improved-output"),
  diff: $("improved-diff"),
  outputSeg: $("output-seg"),
  outputActions: $("output-actions"),
  regenBtn: $("regen-btn"),
  variationLabel: $("variation-label"),
  copyBtn: $("copy-btn"),
  // settings
  apiKey: $("api-key"),
  keyToggle: $("key-toggle"),
  saveKey: $("save-key"),
  settingsError: $("settings-error"), settingsErrorText: $("settings-error-text"),
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
  pickerContainer: $("model-picker-container"),
};

const SPARKLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v4M3 5h4M6 17v4M4 19h4"/><path d="M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z"/></svg>';

let state = {
  savedPrompts: [],
  snippets: [],
  modelsCache: [],
  currentModelId: DEFAULT_MODEL,
  variations: [],
  busy: false,
  picker: null,
};

/* ── View switching ──────────────────────────────────────────────────── */
function showMain() { popup.classList.remove("show-settings", "show-picker"); els.settingsToggle.classList.remove("active"); }
function showSettings() { popup.classList.add("show-settings"); popup.classList.remove("show-picker"); els.settingsToggle.classList.add("active"); }
function showPicker() { popup.classList.add("show-picker"); }

/* ── Banners ─────────────────────────────────────────────────────────── */
function showStatus(msg) {
  els.statusText.textContent = msg;
  els.statusBanner.classList.add("show");
  setTimeout(() => els.statusBanner.classList.remove("show"), 2400);
}
function showError(msg, withSettingsLink = false) {
  els.errorText.replaceChildren(document.createTextNode(msg + (withSettingsLink ? " " : "")));
  if (withSettingsLink) {
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = "Open settings";
    link.addEventListener("click", e => { e.preventDefault(); hideError(); showSettings(); });
    els.errorText.appendChild(link);
  }
  els.errorBanner.classList.add("show");
}
function hideError() { els.errorBanner.classList.remove("show"); }

/* ── Style dropdowns ─────────────────────────────────────────────────── */
function fillStyleSelect(select, selectedId) {
  select.replaceChildren();
  for (const style of STYLES) {
    const opt = document.createElement("option");
    opt.value = style.id;
    opt.textContent = style.label;
    select.appendChild(opt);
  }
  if (state.savedPrompts.length) {
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "──────────";
    select.appendChild(sep);
    state.savedPrompts.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = `${CUSTOM_PROMPT_PREFIX}${i}`;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  }
  if (selectedId && [...select.options].some(o => o.value === selectedId)) select.value = selectedId;
}

/* ── Model chip ──────────────────────────────────────────────────────── */
function renderModelChip() {
  const model = state.modelsCache.find(m => m.id === state.currentModelId);
  if (model) {
    els.chipAvatar.textContent = getProviderMonogram(model);
    els.chipAvatar.style.background = getProviderColor(model);
    els.modelName.textContent = model.name || model.id;
    const price = isFree(model) ? "Free" : (() => { const p = pricePerMTok(model); return p ? `${formatUsd(p.in)} / ${formatUsd(p.out)} per MTok` : "—"; })();
    els.modelMeta.textContent = `${model.id} · ${formatContextLength(model)} · ${price}`;
  } else {
    els.chipAvatar.textContent = "··";
    els.chipAvatar.style.background = "var(--rb-gray-500)";
    els.modelName.textContent = state.currentModelId || DEFAULT_MODEL;
    els.modelMeta.textContent = state.modelsCache.length ? "(not in current list)" : "Tap Change to load models";
  }
}

async function ensureModels() {
  if (state.modelsCache.length) return;
  try {
    const result = await getModels();
    state.modelsCache = result.models;
    renderModelChip();
  } catch (e) {
    console.warn("[popup] models load failed:", e?.message);
  }
}

/* ── Output: result / diff segmented toggle ──────────────────────────── */
function setOutputMode(mode) {
  const isDiff = mode === "diff";
  els.diff.hidden = !isDiff;
  els.output.style.display = isDiff ? "none" : "";
  for (const b of els.outputSeg.querySelectorAll(".rb-seg-btn")) {
    const on = b.dataset.mode === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  }
}

function renderDiff(before, after) {
  els.diff.replaceChildren();
  for (const seg of diffWords(before, after)) {
    if (seg.type === "eq") {
      els.diff.appendChild(document.createTextNode(seg.text));
    } else {
      const span = document.createElement("span");
      span.className = seg.type === "ins" ? "rb-ins" : "rb-del";
      span.textContent = seg.text;
      els.diff.appendChild(span);
    }
  }
}

/* ── Improve flow (streaming) ────────────────────────────────────────── */
async function runImprove(isRegen) {
  if (state.busy) return;
  const text = els.input.value.trim();
  if (!text) { els.input.focus(); return; }
  if (text.length > MAX_INPUT_LENGTH) {
    showError(`Text is too long (max ${MAX_INPUT_LENGTH.toLocaleString()} characters).`);
    return;
  }

  const data = await storage.get(["apiKey", "model", "savedPrompts"]);
  if (!data.apiKey) { showError("Set your OpenRouter API key in settings first.", true); return; }

  state.busy = true;
  hideError();
  const styleId = els.styleSelect.value || DEFAULT_STYLE;
  const systemPrompt = resolveSystemPrompt(styleId, data.savedPrompts || []);

  if (!isRegen) {
    els.improveBtn.disabled = true;
    els.improveBtn.querySelector("svg, .rb-spinner")?.replaceWith(spinnerEl());
    els.improveBtn.querySelector(".rb-btn-text").textContent = "Improving…";
    state.variations = [];
  } else {
    els.regenBtn.disabled = true;
  }

  setOutputMode("result");
  els.output.classList.remove("is-empty");
  els.output.classList.add("is-filled", "is-streaming");
  els.output.value = "";
  els.copyBtn.disabled = true;

  try {
    const full = await streamImproveText({
      text,
      apiKey: data.apiKey,
      model: data.model || state.currentModelId || DEFAULT_MODEL,
      systemPrompt,
      onChunk: delta => {
        els.output.value += delta;
        els.output.scrollTop = els.output.scrollHeight;
      },
    });
    els.output.value = full;
    state.variations.push(full);
    renderDiff(text, full);
    els.copyBtn.disabled = false;
    els.outputSeg.hidden = false;
    els.outputActions.hidden = false;
    els.variationLabel.textContent = `Version ${state.variations.length} of ${state.variations.length}`;
  } catch (err) {
    console.error("[popup] improve failed:", err);
    els.output.classList.add("is-empty");
    els.output.classList.remove("is-filled");
    els.output.value = "";
    const code = err?.name;
    if (code === "InvalidKeyError") showError(err.userMessage || "Your API key was rejected.", true);
    else if (code === "RateLimitError") showError(err.userMessage || "Too many requests. Wait a moment.");
    else showError(err.userMessage || err.message || "Something went wrong.");
  } finally {
    els.output.classList.remove("is-streaming");
    state.busy = false;
    els.improveBtn.disabled = false;
    els.regenBtn.disabled = false;
    els.improveBtn.querySelector(".rb-spinner")?.replaceWith(sparkleEl());
    els.improveBtn.querySelector(".rb-btn-text").textContent = "Improve message";
  }
}

function spinnerEl() { const s = document.createElement("span"); s.className = "rb-spinner"; return s; }
function sparkleEl() { const t = document.createElement("template"); t.innerHTML = SPARKLE; return t.content.firstChild; }

/* ── Settings: prompts + snippets managers ───────────────────────────── */
function renderPrompts() {
  els.promptsList.replaceChildren();
  state.savedPrompts.forEach((p, index) => {
    els.promptsList.appendChild(managerItem(p.name, p.text, {
      onEdit: () => { els.newPromptName.value = p.name; els.customPrompt.value = p.text; els.saveCustomPrompt.dataset.edit = String(index); els.saveCustomPrompt.textContent = "Update"; },
      onDelete: async () => {
        state.savedPrompts.splice(index, 1);
        await storage.set({ savedPrompts: state.savedPrompts });
        renderPrompts();
        fillStyleSelect(els.styleSelect, els.styleSelect.value);
        fillStyleSelect(els.inlineStyle, els.inlineStyle.value);
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
      },
    }));
  });
}

const EDIT_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const DEL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>';

function managerItem(title, sub, { onEdit, onDelete }) {
  const item = document.createElement("div");
  item.className = "rb-manager-item";
  const body = document.createElement("div");
  body.className = "rb-mi-body";
  const t = document.createElement("div"); t.className = "rb-mi-title"; t.textContent = title;
  const s = document.createElement("div"); s.className = "rb-mi-sub"; s.textContent = sub; s.title = sub;
  body.append(t, s);
  const actions = document.createElement("div");
  actions.className = "rb-mi-actions";
  const edit = document.createElement("button"); edit.type = "button"; edit.setAttribute("aria-label", "Edit"); edit.innerHTML = EDIT_SVG; edit.addEventListener("click", onEdit);
  const del = document.createElement("button"); del.type = "button"; del.className = "danger"; del.setAttribute("aria-label", "Delete"); del.innerHTML = DEL_SVG; del.addEventListener("click", onDelete);
  actions.append(edit, del);
  item.append(body, actions);
  return item;
}

/* ── Picker ──────────────────────────────────────────────────────────── */
function openPicker() {
  showPicker();
  state.picker = new ModelPicker({
    container: els.pickerContainer,
    currentModelId: state.currentModelId,
    onSelect: async model => {
      state.currentModelId = model.id;
      if (state.modelsCache.length === 0 && state.picker?.models?.length) state.modelsCache = state.picker.models;
      await setSelectedModel(model.id);
      els.fallbackBanner.classList.remove("show");
      renderModelChip();
      showSettings();
      showStatus(`Model set to ${model.name || model.id}`);
    },
    onClose: () => showSettings(),
  });
  state.picker.open();
}

/* ── First-run / fallback ────────────────────────────────────────────── */
async function reflectKeyState() {
  const { apiKey } = await storage.get(["apiKey"]);
  popup.classList.toggle("no-key", !apiKey);
  if (apiKey) els.apiKey.value = apiKey;
}

async function showFallbackIfNeeded() {
  const { modelFallbackNotice } = await storage.get(["modelFallbackNotice"]);
  if (!modelFallbackNotice) return;
  els.fallbackText.textContent = `"${modelFallbackNotice.from}" is no longer available — switched to "${modelFallbackNotice.to}".`;
  els.fallbackBanner.classList.add("show");
}

/* ── Save key ────────────────────────────────────────────────────────── */
function showSettingsError(msg) {
  els.settingsErrorText.textContent = msg;
  els.settingsError.classList.add("show");
}
async function saveKey() {
  const key = els.apiKey.value.trim();
  els.settingsError.classList.remove("show");
  if (!key) { showSettingsError("Enter an API key."); return; }
  els.saveKey.disabled = true;
  els.saveKey.textContent = "Validating…";
  try {
    const result = await validateApiKey(key);
    if (!result.ok && result.reason === "invalid") throw new Error("API key invalid. Check it at openrouter.ai/keys.");
    await storage.set({ apiKey: key });
    popup.classList.remove("no-key");
    showStatus(result.ok ? "API key saved." : "Saved (couldn't verify — offline).");
  } catch (e) {
    showSettingsError(e.message);
  } finally {
    els.saveKey.disabled = false;
    els.saveKey.textContent = "Save key";
  }
}

/* ── Init ────────────────────────────────────────────────────────────── */
async function init() {
  await migrateFromSync();
  const data = await storage.get([
    "apiKey", "model", "messageType", "savedPrompts", "snippets",
    "enableInlineButton", "inlineMessageType",
  ]);
  state.savedPrompts = Array.isArray(data.savedPrompts) ? data.savedPrompts : [];
  state.snippets = Array.isArray(data.snippets) ? data.snippets : [];
  state.currentModelId = data.model || DEFAULT_MODEL;

  fillStyleSelect(els.styleSelect, data.messageType || DEFAULT_STYLE);
  fillStyleSelect(els.inlineStyle, data.inlineMessageType || DEFAULT_STYLE);
  els.enableInline.checked = data.enableInlineButton !== false;
  renderPrompts();
  renderSnippets();
  renderModelChip();
  ensureModels();
  reflectKeyState();
  showFallbackIfNeeded();

  // header
  els.settingsToggle.addEventListener("click", () => popup.classList.contains("show-settings") ? showMain() : showSettings());
  els.openOptions.addEventListener("click", () => browser.runtime.openOptionsPage().catch(() => {}));
  els.closePopup.addEventListener("click", () => window.close());
  els.setupCta.addEventListener("click", () => showSettings());

  // banner close
  for (const b of document.querySelectorAll(".rb-banner-close")) {
    b.addEventListener("click", () => b.closest(".rb-banner").classList.remove("show"));
  }

  // main
  els.input.addEventListener("input", () => {
    const n = els.input.value.length;
    els.counter.textContent = `${n} ${n === 1 ? "character" : "characters"}`;
  });
  els.improveBtn.addEventListener("click", () => runImprove(false));
  els.regenBtn.addEventListener("click", () => runImprove(true));
  els.outputSeg.addEventListener("click", e => { const b = e.target.closest(".rb-seg-btn"); if (b) setOutputMode(b.dataset.mode); });
  els.copyBtn.addEventListener("click", async () => {
    if (!els.output.value) return;
    try { await navigator.clipboard.writeText(els.output.value); }
    catch { els.output.select(); document.execCommand("copy"); }
    showStatus("Copied to clipboard.");
  });
  els.styleSelect.addEventListener("change", () => storage.set({ messageType: els.styleSelect.value }));

  // settings
  els.keyToggle.addEventListener("click", () => { els.apiKey.type = els.apiKey.type === "password" ? "text" : "password"; });
  els.saveKey.addEventListener("click", saveKey);
  els.openPicker.addEventListener("click", openPicker);
  els.enableInline.addEventListener("change", () => storage.set({ enableInlineButton: els.enableInline.checked }));
  els.inlineStyle.addEventListener("change", () => storage.set({ inlineMessageType: els.inlineStyle.value }));

  els.saveCustomPrompt.addEventListener("click", async () => {
    const name = els.newPromptName.value.trim();
    const text = els.customPrompt.value.trim();
    if (!name || !text) { showSettingsError("Enter both a name and the instruction."); return; }
    const edit = els.saveCustomPrompt.dataset.edit;
    if (edit !== undefined) { state.savedPrompts[Number(edit)] = { name, text }; delete els.saveCustomPrompt.dataset.edit; els.saveCustomPrompt.textContent = "Add"; }
    else state.savedPrompts.push({ name, text });
    await storage.set({ savedPrompts: state.savedPrompts });
    els.newPromptName.value = ""; els.customPrompt.value = "";
    renderPrompts();
    fillStyleSelect(els.styleSelect, els.styleSelect.value);
    fillStyleSelect(els.inlineStyle, els.inlineStyle.value);
  });

  els.saveSnippet.addEventListener("click", async () => {
    const trigger = els.newSnippetTrigger.value.trim();
    const content = els.newSnippetContent.value.trim();
    if (!trigger || !content) { showSettingsError("Enter both a trigger and content."); return; }
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
  });
}

init().catch(e => console.error("[popup] init failed:", e));
