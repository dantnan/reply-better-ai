import browser from "../lib/browser.js";
import { diffWords } from "../lib/diff.js";
import { REPLY_TONES } from "../lib/system-prompts.js";
import {
  isFree, formatContextLength, getProviderMonogram, getProviderColor,
  pricePerMTok, formatUsd,
} from "../lib/models-cache.js";
import { storage, setSelectedModel } from "../lib/storage.js";
import { CUSTOM_PROMPT_PREFIX, DEFAULT_MODEL, AUTO_FREE_MODEL } from "../lib/constants.js";

// ── Static icon markup (safe to use via innerHTML — no dynamic data) ───────
const MARK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const CHEV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const REGEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';
const ERR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
const FIX_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V5"/></svg>';
const CTX_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const PRIV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

// Reply-mode chips: tones + Summarize + the free-form "You tell me".
const REPLY_CHIPS = [
  ...REPLY_TONES.map(t => ({ label: t.label, style: t.id })),
  { label: "Summarize", action: "summarize" },
  { label: "You tell me", action: "custom", custom: true },
];
// Improve-mode chips: tones only (no context, no instruction). "Polish" == improve.
const IMPROVE_CHIPS = [
  { label: "Polish", style: "improve" },
  { label: "Professional", style: "professional" },
  { label: "Friendly", style: "friendly" },
  { label: "Concise", style: "concise" },
];

let current = null;      // the open panel controller, if any
let activePort = null;   // the in-flight stream port, if any
let modelsState = null;  // { models, stale, error } for the switcher, fetched lazily via the SW

export function isPanelOpen() { return !!current; }

export function closePanel() {
  if (!current) return;
  current.destroy();
  current = null;
}

// Stream a generation through the service-worker port. The API key never enters
// the page. onDelta(text), onModel(usedId), resolves with the full text, rejects
// with {code}.
function streamThroughWorker(payload, onDelta, onModel) {
  return new Promise((resolve, reject) => {
    let port;
    try { port = browser.runtime.connect({ name: "rb-improve-stream" }); }
    catch (e) { reject(new Error(e.message)); return; }
    activePort = port;
    let settled = false;
    const finish = () => { if (activePort === port) activePort = null; try { port.disconnect(); } catch {} };
    port.onMessage.addListener(msg => {
      if (msg.delta) onDelta(msg.delta);
      else if (msg.model) onModel?.(msg.model);
      else if (msg.done) { settled = true; resolve(msg.full); finish(); }
      else if (msg.error) { settled = true; const err = new Error(msg.error); err.code = msg.code; reject(err); finish(); }
    });
    port.onDisconnect.addListener(() => { if (activePort === port) activePort = null; if (!settled) reject(new Error("The extension may be reloading. Refresh this page and try again.")); });
    port.postMessage({ action: "stream", ...payload });
  });
}

// Ask the worker for the model list (content scripts can't reach openrouter.ai
// directly — the host page's CSP blocks it).
async function loadModels() {
  if (modelsState && !modelsState.error) return modelsState;
  try {
    const res = await browser.runtime.sendMessage({ action: "getModels" });
    if (res?.error) modelsState = { models: [], stale: false, error: res.error };
    else modelsState = { models: Array.isArray(res?.models) ? res.models : [], stale: !!res?.stale, error: null };
  } catch (e) {
    console.warn("[panel] getModels failed:", e?.message);
    modelsState = { models: [], stale: false, error: e?.message || "Couldn't load models" };
  }
  return modelsState;
}

function modelMeta(m) {
  const ctx = formatContextLength(m);
  if (isFree(m)) return ctx ? `${ctx} context` : "Free";
  const price = pricePerMTok(m);
  const priceStr = price ? `${formatUsd(price.in)}/MTok` : "";
  return [ctx, priceStr].filter(Boolean).join(" · ");
}

export function openPanel({ anchorButton, field, mode, draft, settings, onInsert }) {
  closePanel();

  const savedPrompts = settings.savedPrompts || [];
  const inputText = mode === "improve" ? (draft || "") : "";
  let currentModelId = settings.model || DEFAULT_MODEL;
  let lastUsedModelId = null; // which model actually answered (shown for Auto mode)

  let busy = false;
  let hasResult = false;
  let resultMode = "result";              // "result" | "diff"
  let result = "";
  const variations = [];                  // full results, newest last (history)
  let variIndex = 0;
  let runToken = 0;                       // guards against a superseded stream clobbering the UI
  let captured = null;                    // { text, source } | null
  let consentNeeded = mode === "reply" && !settings.replyConsent;
  let lastGen = null;                     // payload of the last generate, for Regenerate

  // ── Build DOM ─────────────────────────────────────────────────────────
  const panel = document.createElement("div");
  panel.id = "rb-panel";
  panel.className = `reply-better-panel ${mode === "improve" ? "reply-better-improve" : "reply-better-reply"}`;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", mode === "improve" ? "Improve your message" : "Draft a reply");

  // Header: mark + title + model trigger + close
  const head = document.createElement("div");
  head.className = "reply-better-panel-head";
  const mark = el("span", "reply-better-panel-mark"); mark.innerHTML = MARK_SVG;
  const title = el("span", "reply-better-panel-title"); title.textContent = "Reply Better AI";
  const modelTrigger = document.createElement("button");
  modelTrigger.type = "button"; modelTrigger.className = "reply-better-model-trigger";
  modelTrigger.setAttribute("aria-haspopup", "listbox"); modelTrigger.setAttribute("aria-label", "Switch model");
  const mav = el("span", "reply-better-mav");
  const mname = el("span", "reply-better-mname");
  const mchev = el("span", "reply-better-mchev"); mchev.innerHTML = CHEV_SVG;
  modelTrigger.append(mav, mname, mchev);
  const closeBtn = document.createElement("button");
  closeBtn.type = "button"; closeBtn.className = "reply-better-panel-close";
  closeBtn.setAttribute("aria-label", "Close"); closeBtn.innerHTML = CLOSE_SVG;
  head.append(mark, title, modelTrigger, closeBtn);

  const modelMenu = document.createElement("div");
  modelMenu.className = "reply-better-models"; modelMenu.setAttribute("role", "listbox");
  modelMenu.setAttribute("aria-label", "Choose model");

  // Context strip (reply mode only)
  const contextEl = el("div", "reply-better-context");

  // First-run privacy notice (reply mode, until acknowledged)
  const privacyEl = el("div", "reply-better-privacy");
  privacyEl.innerHTML = `<span>${PRIV_SVG}</span>`;
  const privTxt = el("span", "reply-better-privacy-txt");
  privTxt.innerHTML = "Heads up: <b>Reply Better</b> sends the text you select to your chosen model via OpenRouter to draft a reply. Nothing is stored.";
  privacyEl.appendChild(privTxt);

  // Style label + chips
  const styleLbl = el("span", "reply-better-style-label");
  styleLbl.textContent = mode === "improve" ? "How should I rewrite it?" : "How should I reply?";
  const stylesRow = el("div", "reply-better-styles");
  stylesRow.setAttribute("role", "group");

  // Free-form instruction (reply mode, revealed by "You tell me")
  const instructWrap = el("div", "reply-better-instruct");
  const instructBox = document.createElement("textarea");
  instructBox.id = "rb-instruct"; instructBox.className = "reply-better-instruct-box"; instructBox.rows = 2;
  instructBox.setAttribute("aria-label", "Your instruction");
  instructBox.placeholder = "Tell me what to say back, in any language";
  const instructTones = el("div", "reply-better-instruct-tones");
  const instructHint = el("span", "reply-better-instruct-hint"); instructHint.textContent = "Then pick a tone:";
  instructTones.appendChild(instructHint);
  for (const t of REPLY_TONES) {
    const chip = chipBtn(t.label, { style: t.id, sm: true });
    instructTones.appendChild(chip);
  }
  instructWrap.append(instructBox, instructTones);

  // Body: error block + seg + preview + diff
  const body = el("div", "reply-better-panel-body");
  const errorEl = el("div", "reply-better-error");
  const errIc = el("span", "reply-better-error-ic"); errIc.innerHTML = ERR_SVG;
  const errBody = el("div", "reply-better-error-body");
  const errTitle = el("div", "reply-better-error-title"); errTitle.textContent = "Something went wrong";
  const errMsg = el("div", "reply-better-error-msg");
  const errFix = document.createElement("button");
  errFix.type = "button"; errFix.className = "reply-better-error-fix";
  errFix.innerHTML = `${FIX_SVG}<span>Switch model</span>`;
  errBody.append(errTitle, errMsg, errFix);
  errorEl.append(errIc, errBody);

  const seg = el("div", "reply-better-seg"); seg.setAttribute("role", "tablist");
  const segResult = segBtn("Result", "result", true);
  const segDiff = segBtn("Changes", "diff", false);
  seg.append(segResult, segDiff);
  const preview = el("div", "reply-better-preview");
  const diffBox = el("div", "reply-better-diff-box");
  body.append(errorEl, seg, preview, diffBox);

  // Footer: regenerate + version + insert
  const foot = el("div", "reply-better-panel-foot");
  const regen = document.createElement("button");
  regen.type = "button"; regen.id = "rb-panel-regen"; regen.className = "reply-better-pbtn reply-better-pbtn-secondary";
  regen.innerHTML = `${REGEN_SVG}<span>Regenerate</span>`;
  const vari = el("span", "reply-better-vari");
  const insert = document.createElement("button");
  insert.type = "button"; insert.id = "rb-panel-insert"; insert.className = "reply-better-pbtn reply-better-pbtn-primary";
  insert.innerHTML = `${CHECK_SVG}<span>Insert</span>`;
  foot.append(regen, vari, insert);

  panel.append(head, modelMenu, contextEl);
  if (mode === "reply" && consentNeeded) panel.append(privacyEl);
  panel.append(styleLbl, stylesRow, instructWrap, body, foot);
  document.body.appendChild(panel);

  // ── Helpers ─────────────────────────────────────────────────────────
  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function chipBtn(label, { style, action, custom, sm } = {}) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "reply-better-chip" + (custom ? " reply-better-chip-custom" : "") + (sm ? " reply-better-chip-sm" : "");
    if (style) c.dataset.style = style;
    if (action) c.dataset.action = action;
    if (custom) { c.innerHTML = MARK_SVG; c.append(document.createTextNode(" " + label)); }
    else c.textContent = label;
    return c;
  }
  function segBtn(label, modeName, active) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.mode = modeName; b.setAttribute("role", "tab");
    b.textContent = label; if (active) b.className = "reply-better-active";
    return b;
  }

  // ── Model switcher ──────────────────────────────────────────────────
  function reflectModel() {
    if (currentModelId === AUTO_FREE_MODEL) {
      const used = lastUsedModelId && (modelsState?.models || []).find(x => x.id === lastUsedModelId);
      mav.style.background = "#5e6ad2";
      mav.textContent = "⚡";
      mname.textContent = used ? used.name : (lastUsedModelId ? lastUsedModelId.split("/").pop() : "Auto · Fastest free");
      return;
    }
    const m = (modelsState?.models || []).find(x => x.id === currentModelId);
    mav.style.background = getProviderColor(m || { id: currentModelId });
    mav.textContent = getProviderMonogram(m || { id: currentModelId });
    mname.textContent = m?.name || currentModelId.split("/").pop() || currentModelId;
  }
  function renderModelMenu(state) {
    modelMenu.replaceChildren();
    const label = el("span", "reply-better-models-label"); label.textContent = "Switch model";
    modelMenu.appendChild(label);

    // Pinned "Auto · Fastest free": OpenRouter picks the fastest free model and
    // fails over automatically — the natural recovery pick when a free model dies.
    const auto = document.createElement("button");
    auto.type = "button"; auto.setAttribute("role", "option");
    auto.className = "reply-better-model-item" + (currentModelId === AUTO_FREE_MODEL ? " reply-better-current" : "");
    auto.dataset.id = AUTO_FREE_MODEL;
    const aav = el("span", "reply-better-mav"); aav.style.background = "#5e6ad2"; aav.textContent = "⚡";
    const abody = el("span", "reply-better-mbody");
    const an = el("span", "reply-better-mn"); an.textContent = "Auto · Fastest free";
    const am = el("span", "reply-better-mmeta"); am.textContent = "Fastest free model, switches on errors";
    abody.append(an, am);
    const afr = el("span", "reply-better-mfree"); afr.textContent = "Free";
    const achk = el("span", "reply-better-mcheck"); achk.innerHTML = CHECK_SVG;
    auto.append(aav, abody, afr, achk);
    modelMenu.appendChild(auto);

    const models = state?.models || [];
    if (!models.length) {
      // Never a blank popover: the switcher is the recovery path, so say why it's empty.
      const empty = el("div", "reply-better-models-empty");
      empty.textContent = state?.error ? "Couldn’t load models — check your connection." : "No models available.";
      const retry = document.createElement("button");
      retry.type = "button"; retry.className = "reply-better-models-retry"; retry.textContent = "Retry";
      retry.addEventListener("click", async e => { e.stopPropagation(); modelsState = null; renderModelMenu(await loadModels()); });
      modelMenu.append(empty, retry);
      return;
    }
    const seen = new Set();
    const ordered = [];
    const add = m => { if (m && !seen.has(m.id)) { seen.add(m.id); ordered.push(m); } };
    add(models.find(m => m.id === currentModelId));
    models.filter(isFree).forEach(add);
    models.forEach(add);
    for (const m of ordered.slice(0, 30)) {
      const item = document.createElement("button");
      item.type = "button"; item.setAttribute("role", "option");
      item.className = "reply-better-model-item" + (m.id === currentModelId ? " reply-better-current" : "");
      item.dataset.id = m.id;
      const av = el("span", "reply-better-mav"); av.style.background = getProviderColor(m); av.textContent = getProviderMonogram(m);
      const mbody = el("span", "reply-better-mbody");
      const mn = el("span", "reply-better-mn"); mn.textContent = m.name || m.id;
      const mm = el("span", "reply-better-mmeta"); mm.textContent = modelMeta(m);
      mbody.append(mn, mm);
      item.append(av, mbody);
      if (isFree(m)) { const fr = el("span", "reply-better-mfree"); fr.textContent = "Free"; item.appendChild(fr); }
      const chk = el("span", "reply-better-mcheck"); chk.innerHTML = CHECK_SVG; item.appendChild(chk);
      modelMenu.appendChild(item);
    }
  }
  async function openModels() {
    const state = await loadModels();
    reflectModel();
    renderModelMenu(state);
    panel.classList.add("reply-better-models-open");
    position();
  }
  function closeModels() { panel.classList.remove("reply-better-models-open"); }
  modelTrigger.addEventListener("click", e => {
    e.stopPropagation();
    panel.classList.contains("reply-better-models-open") ? closeModels() : openModels();
  });
  modelMenu.addEventListener("click", async e => {
    const item = e.target.closest(".reply-better-model-item");
    if (!item) return;
    currentModelId = item.dataset.id;
    reflectModel();
    closeModels();
    panel.classList.remove("reply-better-has-error");
    try { await setSelectedModel(currentModelId); } catch { /* best effort */ }
    if (hasResult && lastGen) {
      // Abort an in-flight stream so the old model's output can't land as if it
      // were the newly-selected model's; runToken neutralizes its late reject.
      if (busy && activePort) { try { activePort.disconnect(); } catch {} activePort = null; busy = false; }
      lastGen.model = currentModelId;
      run(lastGen, false);
    }
  });

  // ── Context (reply mode) ────────────────────────────────────────────
  function captureSelection() {
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : "";
    return text ? { text, source: "selection" } : null;
  }
  // Explicit, user-triggered capture of the nearest conversation-like container
  // (never a silent full-page scrape — privacy rule). Capped so we don't ship a
  // whole document to the model.
  function capturePageText() {
    const host = field && (field.closest("[role=log],[role=feed],main,article,[role=main]") || field.parentElement);
    let text = (host?.innerText || document.body?.innerText || "").trim();
    if (field) { const own = (field.value || field.innerText || "").trim(); if (own) text = text.split(own).join(" ").trim(); }
    if (text.length > 6000) text = text.slice(-6000);
    return text ? { text, source: "page" } : null;
  }
  function renderContext() {
    contextEl.replaceChildren();
    if (!captured) {
      contextEl.className = "reply-better-context reply-better-ctx-empty";
      const row = el("div", "reply-better-ctx-empty-row");
      const txt = el("span", "reply-better-ctx-txt");
      txt.textContent = "Select the text you’re replying to — or use the conversation on the page.";
      const cap = document.createElement("button");
      cap.type = "button"; cap.className = "reply-better-ctx-capture"; cap.textContent = "Use page text";
      cap.addEventListener("click", ev => {
        ev.stopPropagation();
        const c = capturePageText();
        if (!c) { txt.textContent = "Couldn’t find conversation text here — select the text you’re replying to instead."; return; }
        captured = c; renderContext(); position();
      });
      row.append(txt, cap);
      contextEl.appendChild(row);
      return;
    }
    contextEl.className = "reply-better-context reply-better-collapsed";
    const headRow = el("div", "reply-better-context-head"); headRow.setAttribute("role", "button"); headRow.tabIndex = 0;
    const ic = el("span", "reply-better-ctx-ic"); ic.innerHTML = CTX_SVG;
    const meta = el("span", "reply-better-ctx-meta");
    const cTitle = el("span", "reply-better-ctx-title"); cTitle.textContent = "Replying to selected text";
    const cSub = el("span", "reply-better-ctx-sub");
    const srcTxt = captured.source === "selection" ? "from your selection" : "from the page";
    cSub.append(document.createTextNode(srcTxt + " · "));
    const toggle = el("span", "reply-better-ctx-toggle"); toggle.textContent = "view";
    cSub.appendChild(toggle);
    meta.append(cTitle, cSub);
    const clear = document.createElement("button");
    clear.type = "button"; clear.className = "reply-better-ctx-clear"; clear.textContent = "Clear";
    headRow.append(ic, meta, clear);
    const prev = el("div", "reply-better-ctx-preview");
    const msg = el("div", "reply-better-ctx-msg"); msg.textContent = captured.text;
    prev.appendChild(msg);
    contextEl.append(headRow, prev);
    headRow.addEventListener("click", e => {
      if (e.target.closest(".reply-better-ctx-clear")) return;
      contextEl.classList.toggle("reply-better-collapsed");
      toggle.textContent = contextEl.classList.contains("reply-better-collapsed") ? "view" : "hide";
      position();
    });
    clear.addEventListener("click", e => { e.stopPropagation(); captured = null; renderContext(); position(); });
  }

  // ── Chips ───────────────────────────────────────────────────────────
  function buildChips() {
    stylesRow.replaceChildren();
    const defs = mode === "improve" ? buildImproveChips() : REPLY_CHIPS;
    for (const d of defs) stylesRow.appendChild(chipBtn(d.label, d));
  }
  function buildImproveChips() {
    const chips = [...IMPROVE_CHIPS];
    savedPrompts.forEach((p, i) => chips.push({ label: p.name, style: `${CUSTOM_PROMPT_PREFIX}${i}` }));
    return chips;
  }
  function onChipClick(e) {
    const c = e.target.closest(".reply-better-chip");
    if (!c || busy) return;
    if (c.dataset.action === "custom") {
      panel.classList.toggle("reply-better-custom-open");
      if (panel.classList.contains("reply-better-custom-open")) setTimeout(() => instructBox.focus(), 40);
      position();
      return;
    }
    markChip(c);
    if (mode === "improve") {
      run({ mode: "improve", text: inputText, style: c.dataset.style, model: currentModelId }, false);
    } else if (c.dataset.action === "summarize") {
      const ctx = captured?.text || "";
      if (!ctx) { flashNeedContext(); return; }
      run({ mode: "reply", text: ctx, summarize: true, model: currentModelId }, false);
    } else {
      const ctx = captured?.text || "";
      const instr = instructBox.value.trim();
      if (!ctx && !instr) { flashNeedContext(); return; }
      run({ mode: "reply", text: ctx || instr, tone: c.dataset.style, instruction: instr, model: currentModelId }, false);
    }
  }
  function markChip(active) {
    panel.querySelectorAll(".reply-better-styles .reply-better-chip, .reply-better-instruct-tones .reply-better-chip")
      .forEach(c => c.classList.toggle("reply-better-active", c === active || (active?.dataset.style && c.dataset.style === active.dataset.style)));
  }
  function flashNeedContext() {
    errTitle.textContent = "Nothing to reply to yet";
    errMsg.textContent = "Select the text you’re replying to, or use “You tell me” to type what to say.";
    errFix.style.display = "none";
    // has-error (not has-result) shows the message without revealing the footer.
    panel.classList.add("reply-better-has-error");
    position();
  }
  stylesRow.addEventListener("click", onChipClick);
  instructTones.addEventListener("click", onChipClick);
  instructBox.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !busy) {
      const active = panel.querySelector(".reply-better-instruct-tones .reply-better-chip.reply-better-active")
        || panel.querySelector(".reply-better-instruct-tones .reply-better-chip");
      if (active) onChipClick({ target: active });
    }
  });

  // ── Result mode (Result / Changes) ──────────────────────────────────
  function setResultMode(next) {
    resultMode = next;
    panel.classList.toggle("reply-better-mode-diff", next === "diff");
    segResult.classList.toggle("reply-better-active", next === "result");
    segDiff.classList.toggle("reply-better-active", next === "diff");
    position();
  }
  seg.addEventListener("click", e => { const b = e.target.closest("button"); if (b && result) setResultMode(b.dataset.mode); });

  function renderDiff(before, after) {
    diffBox.replaceChildren();
    for (const s of diffWords(before, after)) {
      if (s.type === "eq") diffBox.appendChild(document.createTextNode(s.text));
      else { const span = el("span", s.type === "ins" ? "reply-better-ins" : "reply-better-del"); span.textContent = s.text; diffBox.appendChild(span); }
    }
  }

  // ── Generate (stream) ───────────────────────────────────────────────
  async function run(payload, isRegen) {
    if (busy) return;
    busy = true;
    const myToken = ++runToken;
    hasResult = true;
    lastGen = payload;
    if (consentNeeded) { consentNeeded = false; privacyEl.remove(); storage.set({ replyConsent: true }).catch(() => {}); }
    panel.classList.remove("reply-better-has-error");
    errFix.style.display = "";
    panel.classList.add("reply-better-has-result", "reply-better-streaming");
    setResultMode("result");
    regen.disabled = true; insert.disabled = true;
    preview.classList.add("reply-better-streaming");
    preview.textContent = "";
    const cursor = el("span", "reply-better-cursor"); preview.appendChild(cursor);
    position();
    if (!isRegen) variations.length = 0;
    try {
      const full = await streamThroughWorker(payload, delta => {
        if (myToken !== runToken) return;
        cursor.remove(); preview.textContent += delta; preview.appendChild(cursor); preview.scrollTop = preview.scrollHeight;
      }, used => {
        if (myToken !== runToken) return;
        lastUsedModelId = used;
        reflectModel(); // Auto mode: show which model actually answered
      });
      if (myToken !== runToken) return;          // a newer run superseded this one
      cursor.remove();
      result = full;
      preview.textContent = full;
      variations.push(full); variIndex = variations.length - 1;
      if (mode === "improve") renderDiff(inputText, full);
      vari.textContent = variations.length > 1 ? `${variIndex + 1} / ${variations.length}` : "";
      insert.disabled = false;
    } catch (err) {
      if (myToken !== runToken) return;          // superseded stream's late reject — ignore
      cursor.remove();
      showError(err);
    } finally {
      if (myToken === runToken) {
        preview.classList.remove("reply-better-streaming");
        panel.classList.remove("reply-better-streaming");
        busy = false;
        regen.disabled = false;
        position();
      }
    }
  }

  function showError(err) {
    const code = err?.code;
    errTitle.textContent = code === "RateLimitError" ? "Rate limit reached"
      : code === "InvalidKeyError" ? "API key rejected"
      : code === "NoApiKey" ? "No API key set"
      : code === "ModelUnavailableError" ? "Model unavailable"
      : code === "NetworkError" ? "Can’t reach OpenRouter"
      : code === "ProviderError" ? "Model error"
      : "Something went wrong";
    errMsg.textContent = err?.message || "Try again, or switch to a different model.";
    errFix.style.display = (code === "NoApiKey" || code === "InvalidKeyError") ? "none" : "";
    insert.disabled = true; regen.disabled = false;
    panel.classList.add("reply-better-has-error");
    position();
  }
  errFix.addEventListener("click", e => { e.stopPropagation(); openModels(); });

  regen.addEventListener("click", () => { if (!busy && lastGen) run(lastGen, true); });
  insert.addEventListener("click", () => { if (result) { onInsert?.(result); closePanel(); } });

  // ── Position / events ───────────────────────────────────────────────
  function position() {
    const r = anchorButton.getBoundingClientRect();
    if (!anchorButton.isConnected || (r.width === 0 && r.height === 0)) return;
    const sx = window.pageXOffset || document.documentElement.scrollLeft;
    const sy = window.pageYOffset || document.documentElement.scrollTop;
    const w = Math.min(mode === "improve" ? 360 : 400, window.innerWidth - 24);
    panel.style.width = `${w}px`;
    let left = r.right - w;
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    const ph = panel.offsetHeight || 360;
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - 8) {
      const above = r.top - ph - 8;
      top = above >= 8 ? above : Math.max(8, window.innerHeight - ph - 8);
    }
    panel.style.left = `${left + sx}px`;
    panel.style.top = `${top + sy}px`;
  }

  const onDocClick = e => {
    if (panel.classList.contains("reply-better-models-open") && !modelMenu.contains(e.target) && !modelTrigger.contains(e.target)) closeModels();
    if (!panel.contains(e.target) && e.target !== anchorButton && !anchorButton.contains(e.target)) closePanel();
  };
  const onKey = e => { if (e.key === "Escape") closePanel(); };
  const onReposition = () => position();
  setTimeout(() => document.addEventListener("mousedown", onDocClick, true), 0);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onReposition, true);
  window.addEventListener("resize", onReposition);

  current = {
    destroy() {
      if (activePort) { try { activePort.disconnect(); } catch {} activePort = null; }
      document.removeEventListener("mousedown", onDocClick, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
      panel.remove();
    },
  };

  // ── Go ──────────────────────────────────────────────────────────────
  reflectModel();
  buildChips();
  if (mode === "reply") { captured = captureSelection(); renderContext(); }
  position();
  requestAnimationFrame(() => { panel.classList.add("reply-better-open"); position(); });
  if (mode === "reply") setTimeout(() => { /* leave focus on the page selection */ }, 0);
}
