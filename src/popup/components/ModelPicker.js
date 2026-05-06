import { getModels, isFree, formatPrice, formatContextLength, getProvider, uniqueProviders } from "../../lib/models-cache.js";
import { POPULAR_IDS } from "../../data/popular-models.js";

const TABS = [
  { id: "popular", label: "Popular" },
  { id: "free", label: "Free" },
  { id: "all", label: "All" },
];

export class ModelPicker {
  constructor({ container, onSelect, onClose, currentModelId }) {
    this.container = container;
    this.onSelect = onSelect;
    this.onClose = onClose;
    this.currentModelId = currentModelId;
    this.activeTab = "popular";
    this.searchQuery = "";
    this.providerFilter = "";
    this.models = [];
    this.stale = false;
    this.error = null;
    this.loading = true;
  }

  async open() {
    this.renderShell();
    await this.refresh({ forceRefresh: false });
  }

  async refresh({ forceRefresh = false } = {}) {
    this.loading = true;
    this.error = null;
    this.renderBody();
    try {
      const result = await getModels({ forceRefresh });
      this.models = result.models;
      this.stale = result.stale;
    } catch (err) {
      this.error = err;
      // Keep the previous list if we have one — wiping it on a transient
      // network blip is user-hostile, especially during a manual refresh.
      if (this.models.length > 0) this.stale = true;
    } finally {
      this.loading = false;
      this.renderBody();
    }
  }

  renderShell() {
    this.container.replaceChildren();
    this.container.classList.add("model-picker");

    const header = document.createElement("div");
    header.className = "mp-header";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "mp-back";
    back.textContent = "← Back";
    back.addEventListener("click", () => this.onClose?.());
    header.appendChild(back);

    const title = document.createElement("h3");
    title.textContent = "Choose model";
    header.appendChild(title);

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "mp-refresh";
    refreshBtn.title = "Refresh model list";
    refreshBtn.textContent = "↻";
    refreshBtn.addEventListener("click", () => this.refresh({ forceRefresh: true }));
    header.appendChild(refreshBtn);

    this.container.appendChild(header);

    const tabsEl = document.createElement("div");
    tabsEl.className = "mp-tabs";
    for (const tab of TABS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.tab = tab.id;
      btn.textContent = tab.label;
      if (tab.id === this.activeTab) btn.classList.add("active");
      btn.addEventListener("click", () => {
        this.activeTab = tab.id;
        for (const b of tabsEl.querySelectorAll("button")) {
          b.classList.toggle("active", b.dataset.tab === tab.id);
        }
        this.renderBody();
      });
      tabsEl.appendChild(btn);
    }
    this.container.appendChild(tabsEl);

    const filters = document.createElement("div");
    filters.className = "mp-filters";

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search models...";
    search.value = this.searchQuery;
    search.addEventListener("input", e => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.renderBody();
    });
    filters.appendChild(search);

    this.providerSelect = document.createElement("select");
    this.providerSelect.addEventListener("change", e => {
      this.providerFilter = e.target.value;
      this.renderBody();
    });
    filters.appendChild(this.providerSelect);

    this.container.appendChild(filters);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "mp-body";
    this.container.appendChild(this.bodyEl);
  }

  renderBody() {
    if (!this.bodyEl) return;

    if (this.providerSelect) {
      const currentValue = this.providerSelect.value;
      this.providerSelect.replaceChildren();
      const allOpt = document.createElement("option");
      allOpt.value = "";
      allOpt.textContent = "All providers";
      this.providerSelect.appendChild(allOpt);
      for (const provider of uniqueProviders(this.models)) {
        const opt = document.createElement("option");
        opt.value = provider;
        opt.textContent = provider;
        this.providerSelect.appendChild(opt);
      }
      this.providerSelect.value = currentValue;
    }

    this.bodyEl.replaceChildren();

    if (this.loading) {
      const loading = document.createElement("div");
      loading.className = "mp-loading";
      loading.textContent = "Loading models...";
      this.bodyEl.appendChild(loading);
      return;
    }

    if (this.error && this.models.length === 0) {
      const errEl = document.createElement("div");
      errEl.className = "mp-error";
      errEl.textContent = `Could not load models: ${this.error.userMessage || this.error.message}`;
      this.bodyEl.appendChild(errEl);
      return;
    }

    if (this.stale) {
      const staleEl = document.createElement("div");
      staleEl.className = "mp-stale";
      staleEl.textContent = "Showing cached list (couldn't reach OpenRouter just now).";
      this.bodyEl.appendChild(staleEl);
    }

    const filtered = this.filteredModels();
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "mp-empty";
      empty.textContent = "No models match the current filters.";
      this.bodyEl.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "mp-list";
    for (const model of filtered) {
      list.appendChild(this.renderRow(model));
    }
    this.bodyEl.appendChild(list);
  }

  filteredModels() {
    let list = this.models;
    if (this.activeTab === "free") {
      list = list.filter(isFree);
    } else if (this.activeTab === "popular") {
      const byId = new Map(list.map(m => [m.id, m]));
      list = POPULAR_IDS.map(id => byId.get(id)).filter(Boolean);
    }
    if (this.providerFilter) {
      list = list.filter(m => getProvider(m) === this.providerFilter);
    }
    if (this.searchQuery) {
      const q = this.searchQuery;
      list = list.filter(m =>
        (m.id || "").toLowerCase().includes(q) ||
        (m.name || "").toLowerCase().includes(q) ||
        (m.description || "").toLowerCase().includes(q),
      );
    }
    return list;
  }

  renderRow(model) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "mp-row";
    if (model.id === this.currentModelId) row.classList.add("selected");

    const main = document.createElement("div");
    main.className = "mp-row-main";

    const name = document.createElement("div");
    name.className = "mp-row-name";
    name.textContent = model.name || model.id;
    main.appendChild(name);

    const sub = document.createElement("div");
    sub.className = "mp-row-sub";
    const id = document.createElement("span");
    id.className = "mp-row-id";
    id.textContent = model.id;
    sub.appendChild(id);
    const ctx = formatContextLength(model);
    if (ctx) {
      const ctxEl = document.createElement("span");
      ctxEl.className = "mp-row-ctx";
      ctxEl.textContent = ctx;
      sub.appendChild(ctxEl);
    }
    main.appendChild(sub);

    row.appendChild(main);

    const meta = document.createElement("div");
    meta.className = "mp-row-meta";
    const price = document.createElement("span");
    price.className = "mp-row-price";
    if (isFree(model)) price.classList.add("free");
    price.textContent = formatPrice(model);
    meta.appendChild(price);
    if (model.id === this.currentModelId) {
      const check = document.createElement("span");
      check.className = "mp-row-check";
      check.textContent = "✓";
      meta.appendChild(check);
    }
    row.appendChild(meta);

    row.addEventListener("click", () => this.onSelect?.(model));
    return row;
  }

  setCurrentModel(id) {
    this.currentModelId = id;
    this.renderBody();
  }
}
