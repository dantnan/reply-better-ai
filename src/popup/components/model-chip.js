import { formatPrice, formatContextLength } from "../../lib/models-cache.js";
import { DEFAULT_MODEL } from "../../lib/constants.js";

// Renders the "currently selected model" line shared by popup and options.
export function renderModelChip({ nameEl, metaEl, models, currentModelId, emptyHint }) {
  const model = models.find(m => m.id === currentModelId);
  if (model) {
    nameEl.textContent = model.name || model.id;
    metaEl.textContent = `${model.id} · ${formatContextLength(model)} · ${formatPrice(model)}`;
    return;
  }
  nameEl.textContent = currentModelId || DEFAULT_MODEL;
  metaEl.textContent = models.length === 0 ? emptyHint : "(not in current list)";
}
