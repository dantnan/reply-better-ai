import { storage, migrateFromSync } from "../lib/storage.js";
import { validateApiKey } from "../lib/openrouter.js";
import { getModels, formatPrice, formatContextLength } from "../lib/models-cache.js";
import { ModelPicker } from "../popup/components/ModelPicker.js";
import { DEFAULT_MODEL } from "../lib/constants.js";

const $ = (id) => document.getElementById(id);

const els = {
  apiKey: $("opt-api-key"),
  saveKey: $("opt-save-key"),
  status: $("options-status"),
  modelName: $("opt-model-name"),
  modelMeta: $("opt-model-meta"),
  pickModel: $("opt-pick-model"),
  pickerContainer: $("opt-picker-container"),
};

let currentModelId = DEFAULT_MODEL;
let modelsCache = [];

function showStatus(message, type = "success") {
  els.status.textContent = message;
  els.status.className = type;
  els.status.classList.remove("hidden");
  setTimeout(() => els.status.classList.add("hidden"), 3000);
}

function renderModelDisplay() {
  const model = modelsCache.find(m => m.id === currentModelId);
  if (model) {
    els.modelName.textContent = model.name || model.id;
    els.modelMeta.textContent = `${model.id} · ${formatContextLength(model)} · ${formatPrice(model)}`;
  } else {
    els.modelName.textContent = currentModelId || DEFAULT_MODEL;
    els.modelMeta.textContent = modelsCache.length === 0 ? "Click Choose model to load list" : "(not in current list)";
  }
}

async function loadAll() {
  await migrateFromSync();
  const data = await storage.get(["apiKey", "model"]);
  if (data.apiKey) els.apiKey.value = data.apiKey;
  currentModelId = data.model || DEFAULT_MODEL;
  renderModelDisplay();
  try {
    const result = await getModels();
    modelsCache = result.models;
    renderModelDisplay();
  } catch (err) {
    console.warn("[options] models load failed:", err.message);
  }
}

els.saveKey.addEventListener("click", async () => {
  const key = els.apiKey.value.trim();
  if (!key) {
    showStatus("Enter an API key.", "error");
    return;
  }
  els.saveKey.disabled = true;
  els.saveKey.textContent = "Validating…";
  try {
    const valid = await validateApiKey(key);
    if (!valid) throw new Error("API key invalid. Check at openrouter.ai/keys.");
    await storage.set({ apiKey: key });
    showStatus("API key saved.", "success");
  } catch (e) {
    showStatus(e.message, "error");
  } finally {
    els.saveKey.disabled = false;
    els.saveKey.textContent = "Save";
  }
});

els.pickModel.addEventListener("click", () => {
  els.pickerContainer.replaceChildren();
  const picker = new ModelPicker({
    container: els.pickerContainer,
    currentModelId,
    onSelect: async (model) => {
      currentModelId = model.id;
      await storage.set({ model: model.id });
      els.pickerContainer.replaceChildren();
      renderModelDisplay();
      showStatus(`Default model set to ${model.name || model.id}`, "success");
    },
    onClose: () => {
      els.pickerContainer.replaceChildren();
    },
  });
  picker.open();
});

loadAll().catch(err => showStatus(`Load error: ${err.message}`, "error"));
