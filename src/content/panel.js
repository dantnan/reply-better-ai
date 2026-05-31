import browser from "../lib/browser.js";
import { STYLES } from "../lib/system-prompts.js";
import { CUSTOM_PROMPT_PREFIX, DEFAULT_STYLE } from "../lib/constants.js";
import { diffWords } from "../lib/diff.js";

const MARK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const REGEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

let current = null; // the open panel controller, if any
let activePort = null; // the in-flight stream port, if any — so we can cancel it

export function closePanel() {
  if (!current) return;
  current.destroy();
  current = null;
}

export function isPanelOpen() { return !!current; }

// Stream a rewrite through the service worker port. onDelta(text), resolves with full text.
function streamThroughWorker({ text, messageType, onDelta }) {
  return new Promise((resolve, reject) => {
    let port;
    try { port = browser.runtime.connect({ name: "rb-improve-stream" }); }
    catch (e) { reject(new Error(e.message)); return; }
    activePort = port;
    let settled = false;
    const finish = () => { if (activePort === port) activePort = null; try { port.disconnect(); } catch {} };
    port.onMessage.addListener(msg => {
      if (msg.delta) onDelta(msg.delta);
      else if (msg.done) { settled = true; resolve(msg.full); finish(); }
      else if (msg.error) { settled = true; const err = new Error(msg.error); err.code = msg.code; reject(err); finish(); }
    });
    port.onDisconnect.addListener(() => { if (activePort === port) activePort = null; if (!settled) reject(new Error("The extension may be reloading. Refresh this page and try again.")); });
    port.postMessage({ action: "stream", text, messageType });
  });
}

export function openPanel({ anchorButton, inputText, settings, onInsert, onClose }) {
  closePanel();

  const savedPrompts = settings.savedPrompts || [];
  let styleId = settings.inlineMessageType || DEFAULT_STYLE;
  let mode = "result";
  let busy = false;
  const variations = [];
  let result = "";

  // ── DOM ──────────────────────────────────────────────────────────────
  const panel = document.createElement("div");
  panel.className = "reply-better-panel";

  const head = document.createElement("div");
  head.className = "reply-better-panel-head";
  const mark = document.createElement("span"); mark.className = "reply-better-panel-mark"; mark.innerHTML = MARK_SVG;
  const title = document.createElement("span"); title.className = "reply-better-panel-title"; title.textContent = "Reply Better AI";
  const closeBtn = document.createElement("button"); closeBtn.type = "button"; closeBtn.className = "reply-better-panel-close"; closeBtn.setAttribute("aria-label", "Close"); closeBtn.innerHTML = CLOSE_SVG;
  head.append(mark, title, closeBtn);

  // style chips
  const chipsWrap = document.createElement("div");
  chipsWrap.className = "reply-better-styles";
  const chipDefs = [
    ...STYLES.map(s => ({ id: s.id, label: s.label })),
    ...savedPrompts.map((p, i) => ({ id: `${CUSTOM_PROMPT_PREFIX}${i}`, label: p.name })),
  ];
  const chipEls = new Map();
  for (const def of chipDefs) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "reply-better-chip";
    chip.textContent = def.label;
    chip.addEventListener("click", () => { if (busy || def.id === styleId) return; styleId = def.id; markChips(); run(false); });
    chipsWrap.appendChild(chip);
    chipEls.set(def.id, chip);
  }

  // seg
  const seg = document.createElement("div");
  seg.className = "reply-better-seg";
  const segResult = document.createElement("button"); segResult.type = "button"; segResult.textContent = "Result"; segResult.className = "reply-better-active";
  const segDiff = document.createElement("button"); segDiff.type = "button"; segDiff.textContent = "Changes";
  seg.append(segResult, segDiff);

  // body
  const body = document.createElement("div");
  body.className = "reply-better-panel-body";
  const preview = document.createElement("div"); preview.className = "reply-better-preview";
  const diffBox = document.createElement("div"); diffBox.className = "reply-better-diff-box";
  body.append(preview, diffBox);

  // foot
  const foot = document.createElement("div");
  foot.className = "reply-better-panel-foot";
  const regen = document.createElement("button"); regen.type = "button"; regen.className = "reply-better-pbtn reply-better-pbtn-secondary"; regen.innerHTML = `${REGEN_SVG}<span>Regenerate</span>`;
  const insert = document.createElement("button"); insert.type = "button"; insert.className = "reply-better-pbtn reply-better-pbtn-primary"; insert.innerHTML = `${CHECK_SVG}<span>Insert</span>`;
  const vari = document.createElement("span"); vari.className = "reply-better-vari";
  foot.append(regen, insert, vari);

  panel.append(head, chipsWrap, seg, body, foot);
  document.body.appendChild(panel);

  // ── helpers ────────────────────────────────────────────────────────
  function markChips() {
    for (const [id, el] of chipEls) el.classList.toggle("reply-better-active", id === styleId);
  }
  function setMode(next) {
    mode = next;
    panel.classList.toggle("reply-better-mode-diff", mode === "diff");
    segResult.classList.toggle("reply-better-active", mode === "result");
    segDiff.classList.toggle("reply-better-active", mode === "diff");
  }
  function renderDiff() {
    diffBox.replaceChildren();
    for (const s of diffWords(inputText, result)) {
      if (s.type === "eq") diffBox.appendChild(document.createTextNode(s.text));
      else { const span = document.createElement("span"); span.className = s.type === "ins" ? "reply-better-ins" : "reply-better-del"; span.textContent = s.text; diffBox.appendChild(span); }
    }
  }
  function position() {
    const r = anchorButton.getBoundingClientRect();
    // If the anchor was detached (e.g. the button got removed), its rect is all
    // zeros — don't yank the panel to the top-left corner; keep the last spot.
    if (!anchorButton.isConnected || (r.width === 0 && r.height === 0)) return;
    const sx = window.pageXOffset || document.documentElement.scrollLeft;
    const sy = window.pageYOffset || document.documentElement.scrollTop;
    const pw = panel.offsetWidth || 360;
    const ph = panel.offsetHeight || 280;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal (viewport coords): right-align to the button; if that runs off
    // the left, left-align to the button instead; finally clamp on-screen — so
    // the panel always sits adjacent to the button, never slammed to a screen edge.
    let left = r.right - pw;
    if (left < 8) left = r.left;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;

    // Vertical: below the button; flip above if it would overflow and there's
    // room; otherwise clamp so the panel stays fully on-screen.
    let top = r.bottom + 8;
    if (top + ph > vh - 8) {
      const above = r.top - ph - 8;
      top = above >= 8 ? above : Math.max(8, vh - ph - 8);
    }

    panel.style.left = `${left + sx}px`;
    panel.style.top = `${top + sy}px`;
  }

  async function run(isRegen) {
    if (busy) return;
    busy = true;
    setMode("result");
    insert.disabled = true; regen.disabled = true;
    preview.classList.add("reply-better-streaming");
    preview.textContent = "";
    const cursor = document.createElement("span"); cursor.className = "reply-better-cursor"; preview.appendChild(cursor);
    if (!isRegen) variations.length = 0;
    try {
      const full = await streamThroughWorker({
        text: inputText,
        messageType: styleId,
        onDelta: delta => { cursor.remove(); preview.textContent += delta; preview.appendChild(cursor); preview.scrollTop = preview.scrollHeight; },
      });
      cursor.remove();
      result = full;
      preview.textContent = full;
      variations.push(full);
      renderDiff();
      insert.disabled = false;
      vari.textContent = `Version ${variations.length} of ${variations.length}`;
      position();
    } catch (err) {
      cursor.remove();
      preview.textContent = err.message || "Something went wrong.";
    } finally {
      preview.classList.remove("reply-better-streaming");
      busy = false;
      regen.disabled = false;
    }
  }

  // ── events ───────────────────────────────────────────────────────────
  closeBtn.addEventListener("click", () => { onClose?.(); closePanel(); });
  segResult.addEventListener("click", () => setMode("result"));
  segDiff.addEventListener("click", () => { if (result) setMode("diff"); });
  regen.addEventListener("click", () => run(true));
  insert.addEventListener("click", () => { if (result) { onInsert?.(result); closePanel(); } });

  const onDocClick = e => { if (!panel.contains(e.target) && e.target !== anchorButton) { onClose?.(); closePanel(); } };
  const onKey = e => { if (e.key === "Escape") { onClose?.(); closePanel(); } };
  const onReposition = () => position();
  setTimeout(() => document.addEventListener("mousedown", onDocClick, true), 0);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onReposition, true);
  window.addEventListener("resize", onReposition);

  current = {
    destroy() {
      // Cancel an in-flight stream: disconnecting the port makes the worker
      // abort the upstream OpenRouter request instead of streaming to nobody.
      if (activePort) { try { activePort.disconnect(); } catch {} activePort = null; }
      document.removeEventListener("mousedown", onDocClick, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
      panel.remove();
    },
  };

  // ── go ─────────────────────────────────────────────────────────────
  markChips();
  position();
  requestAnimationFrame(() => { panel.classList.add("reply-better-open"); position(); });
  run(false);
}
