// Shared settings-surface helpers used by both the popup settings panel and the
// full options page: the style dropdown, the model chip, and the add/edit/delete
// list rows for custom prompts and snippets.
import { STYLES } from "../../lib/system-prompts.js";
import { CUSTOM_PROMPT_PREFIX, DEFAULT_MODEL, AUTO_FREE_MODEL } from "../../lib/constants.js";
import {
  isFree, formatContextLength, pricePerMTok, formatUsd,
  getProviderColor, getProviderMonogram,
} from "../../lib/models-cache.js";

export function fillStyleSelect(select, savedPrompts, selectedId) {
  select.replaceChildren();
  for (const style of STYLES) {
    const opt = document.createElement("option");
    opt.value = style.id;
    opt.textContent = style.label;
    select.appendChild(opt);
  }
  if (savedPrompts?.length) {
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "──────────";
    select.appendChild(sep);
    savedPrompts.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = `${CUSTOM_PROMPT_PREFIX}${i}`;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  }
  if (selectedId && [...select.options].some(o => o.value === selectedId)) {
    select.value = selectedId;
  }
}

export function renderModelChip({ avatarEl, nameEl, metaEl, models, currentModelId, emptyHint }) {
  if (currentModelId === AUTO_FREE_MODEL) {
    if (avatarEl) { avatarEl.textContent = "⚡"; avatarEl.style.background = "#5e6ad2"; }
    nameEl.textContent = "Auto · Fastest free";
    metaEl.textContent = "Picks the fastest free model, switches on errors";
    return;
  }
  const model = models.find(m => m.id === currentModelId);
  if (model) {
    if (avatarEl) {
      avatarEl.textContent = getProviderMonogram(model);
      avatarEl.style.background = getProviderColor(model);
    }
    nameEl.textContent = model.name || model.id;
    const price = isFree(model)
      ? "Free"
      : (() => { const p = pricePerMTok(model); return p ? `${formatUsd(p.in)} / ${formatUsd(p.out)} per MTok` : "—"; })();
    metaEl.textContent = `${model.id} · ${formatContextLength(model)} · ${price}`;
  } else {
    if (avatarEl) { avatarEl.textContent = "··"; avatarEl.style.background = "var(--rb-gray-500)"; }
    nameEl.textContent = currentModelId || DEFAULT_MODEL;
    metaEl.textContent = models.length ? "(not in current list)" : emptyHint;
  }
}

const EDIT_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const DEL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>';

export function managerItem(title, sub, { onEdit, onDelete }) {
  const item = document.createElement("div");
  item.className = "rb-manager-item";
  const body = document.createElement("div");
  body.className = "rb-mi-body";
  const t = document.createElement("div"); t.className = "rb-mi-title"; t.textContent = title;
  const s = document.createElement("div"); s.className = "rb-mi-sub"; s.textContent = sub; s.title = sub;
  body.append(t, s);
  const actions = document.createElement("div");
  actions.className = "rb-mi-actions";
  const edit = document.createElement("button");
  edit.type = "button"; edit.setAttribute("aria-label", "Edit"); edit.innerHTML = EDIT_SVG;
  edit.addEventListener("click", onEdit);
  const del = document.createElement("button");
  del.type = "button"; del.className = "danger"; del.setAttribute("aria-label", "Delete"); del.innerHTML = DEL_SVG;
  del.addEventListener("click", onDelete);
  actions.append(edit, del);
  item.append(body, actions);
  return item;
}
