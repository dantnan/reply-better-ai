import { storage, migrateFromSync, setSelectedModel } from "../lib/storage.js";
import { validateApiKey } from "../lib/openrouter.js";
import { getModels } from "../lib/models-cache.js";
import { ModelPicker } from "../popup/components/ModelPicker.js";
import { renderModelChip } from "../popup/components/model-chip.js";
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
  renderModelChip({
    nameEl: els.modelName,
    metaEl: els.modelMeta,
    models: modelsCache,
    currentModelId,
    emptyHint: "Click Choose model to load list",
  });
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
    if (result.stale) showStatus("Showing a cached model list — couldn't reach OpenRouter.", "info");
    renderModelDisplay();
  } catch (err) {
    console.warn("[options] models load failed:", err?.message);
    showStatus("Couldn't reach OpenRouter to load the model list.", "error");
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
    const result = await validateApiKey(key);
    if (!result.ok) {
      if (result.reason === "invalid") throw new Error("API key invalid. Check it at openrouter.ai/keys.");
      if (result.reason === "timeout" || result.reason === "network") {
        await storage.set({ apiKey: key });
        showStatus("Couldn't reach OpenRouter — saved the key anyway.", "info");
        return;
      }
      throw new Error(`OpenRouter returned ${result.status}. Try again later.`);
    }
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
      await setSelectedModel(model.id);
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
