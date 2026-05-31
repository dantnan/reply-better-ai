import {
  getModels, isFree, formatContextLength, getProvider, uniqueProviders,
  getProviderLabel, getProviderColor, getProviderMonogram, pricePerMTok, formatUsd,
} from "../../lib/models-cache.js";
import { POPULAR_IDS } from "../../data/popular-models.js";

const TABS = [
  { id: "popular", label: "Popular" },
  { id: "free", label: "Free" },
  { id: "all", label: "All" },
];

// Inline SVGs — CSP-safe (static strings, no eval / no external fetch).
const ICONS = {
  back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  search: '<svg class="mp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  ctx: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  empty: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>',
  bolt: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>',
};

const OPENROUTER_MODELS_URL = "https://openrouter.ai/models";

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
    this.applyState();
    try {
      const result = await getModels({ forceRefresh });
      this.models = result.models;
      this.stale = result.stale;
    } catch (err) {
      this.error = err;
      if (this.models.length > 0) this.stale = true;
    } finally {
      this.loading = false;
      this.renderBody();
    }
  }

  renderShell() {
    this.container.replaceChildren();

    const mp = document.createElement("div");
    mp.className = "mp";
    this.mp = mp;

    // Header: title + back
    const head = document.createElement("div");
    head.className = "mp-head";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h2");
    title.className = "mp-head-title";
    title.textContent = "Choose a model";
    const sub = document.createElement("p");
    sub.className = "mp-head-sub";
    sub.textContent = "Routed through OpenRouter";
    titleWrap.append(title, sub);
    const back = document.createElement("button");
    back.type = "button";
    back.className = "mp-back";
    back.innerHTML = `${ICONS.back} Back`;
    back.addEventListener("click", () => this.onClose?.());
    head.append(titleWrap, back);
    mp.appendChild(head);

    // Tabs
    const tabsEl = document.createElement("div");
    tabsEl.className = "mp-tabs";
    tabsEl.setAttribute("role", "tablist");
    this.tabEls = {};
    for (const tab of TABS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mp-tab";
      btn.dataset.tab = tab.id;
      btn.setAttribute("role", "tab");
      btn.innerHTML = `${tab.label} <span class="mp-tab-count"></span>`;
      btn.addEventListener("click", () => {
        this.activeTab = tab.id;
        this.renderBody();
      });
      tabsEl.appendChild(btn);
      this.tabEls[tab.id] = btn;
    }
    mp.appendChild(tabsEl);

    // Filters: search + provider
    const filters = document.createElement("div");
    filters.className = "mp-filters";

    const searchWrap = document.createElement("div");
    searchWrap.className = "mp-search-wrap";
    searchWrap.innerHTML = ICONS.search;
    const search = document.createElement("input");
    search.type = "search";
    search.className = "mp-search";
    search.placeholder = "Search models…";
    search.setAttribute("aria-label", "Search models");
    search.autocomplete = "off";
    search.spellcheck = false;
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "mp-search-clear";
    clear.setAttribute("aria-label", "Clear search");
    clear.innerHTML = ICONS.x;
    search.addEventListener("input", () => {
      this.searchQuery = search.value.trim().toLowerCase();
      searchWrap.classList.toggle("has-value", !!search.value);
      this.renderBody();
    });
    clear.addEventListener("click", () => {
      search.value = "";
      this.searchQuery = "";
      searchWrap.classList.remove("has-value");
      search.focus();
      this.renderBody();
    });
    searchWrap.append(search, clear);
    filters.appendChild(searchWrap);

    this.providerSelect = document.createElement("select");
    this.providerSelect.className = "mp-provider";
    this.providerSelect.setAttribute("aria-label", "Filter by provider");
    this.providerSelect.addEventListener("change", e => {
      this.providerFilter = e.target.value;
      this.renderBody();
    });
    filters.appendChild(this.providerSelect);
    mp.appendChild(filters);

    // Stale notice
    const stale = document.createElement("div");
    stale.className = "mp-stale";
    stale.innerHTML = `${ICONS.bolt}<span>Showing your last cached model list — couldn't reach OpenRouter.</span>`;
    mp.appendChild(stale);

    // List
    const list = document.createElement("div");
    list.className = "mp-list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Models");
    mp.appendChild(list);
    this.list = list;

    // Skeleton (loading)
    const skel = document.createElement("div");
    skel.className = "mp-skel-list";
    for (let i = 0; i < 6; i++) {
      const s = document.createElement("div");
      s.className = "mp-skel";
      s.innerHTML =
        '<div class="mp-skel-avatar"></div>' +
        `<div><div class="mp-skel-bar" style="width:${45 + (i * 13) % 40}%"></div>` +
        `<div class="mp-skel-bar" style="width:${60 + (i * 17) % 30}%;margin-top:7px;height:8px"></div></div>` +
        '<div class="mp-skel-bar" style="width:40px"></div>';
      skel.appendChild(s);
    }
    mp.appendChild(skel);

    // Empty
    const empty = document.createElement("div");
    empty.className = "mp-empty";
    empty.innerHTML = ICONS.empty +
      '<div class="mp-empty-title">No models match</div>' +
      '<div class="mp-empty-hint">Try a different search or switch to the All tab.</div>';
    this.emptyEl = empty;
    mp.appendChild(empty);

    // Footer
    const foot = document.createElement("div");
    foot.className = "mp-foot";
    const count = document.createElement("span");
    count.className = "mp-count";
    const link = document.createElement("a");
    link.href = OPENROUTER_MODELS_URL;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Browse all on OpenRouter →";
    foot.append(count, link);
    mp.appendChild(foot);
    this.count = count;

    this.container.appendChild(mp);
  }

  applyState() {
    if (!this.mp) return;
    let cls = "mp";
    if (this.loading) cls += " is-loading";
    else if (this.stale) cls += " is-stale";
    this.mp.className = cls;
  }

  renderBody() {
    if (!this.mp) return;

    // Tab active state + counts
    const popularCount = this.models.filter(m => POPULAR_IDS.includes(m.id)).length;
    const freeCount = this.models.filter(isFree).length;
    const counts = { popular: popularCount, free: freeCount, all: this.models.length };
    for (const [id, btn] of Object.entries(this.tabEls)) {
      const active = this.activeTab === id;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      btn.querySelector(".mp-tab-count").textContent = counts[id] ? String(counts[id]) : "";
    }

    // Provider <select> options
    const currentProvider = this.providerSelect.value;
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
    this.providerSelect.value = currentProvider;

    if (this.loading) {
      this.applyState();
      return;
    }

    const filtered = this.filteredModels();
    this.list.replaceChildren();
    for (const model of filtered) {
      this.list.appendChild(this.renderRow(model));
    }

    // Empty hint reflects error vs. no-match
    if (this.error && this.models.length === 0) {
      this.emptyEl.querySelector(".mp-empty-title").textContent = "Couldn't load models";
      this.emptyEl.querySelector(".mp-empty-hint").textContent =
        this.error.userMessage || "Check your connection and try again.";
    } else {
      this.emptyEl.querySelector(".mp-empty-title").textContent = "No models match";
      this.emptyEl.querySelector(".mp-empty-hint").textContent =
        "Try a different search or switch to the All tab.";
    }

    let cls = "mp";
    if (this.stale) cls += " is-stale";
    if (filtered.length === 0) cls += " is-empty";
    this.mp.className = cls;

    this.count.textContent = `${filtered.length} ${filtered.length === 1 ? "model" : "models"}`;
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
        getProviderLabel(m).toLowerCase().includes(q),
      );
    }
    return list;
  }

  renderRow(model) {
    const selected = model.id === this.currentModelId;
    const row = document.createElement("button");
    row.type = "button";
    row.className = selected ? "mp-row selected" : "mp-row";
    row.dataset.id = model.id;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", selected ? "true" : "false");

    // Avatar
    const avatar = document.createElement("span");
    avatar.className = "mp-row-avatar";
    avatar.style.background = getProviderColor(model);
    avatar.textContent = getProviderMonogram(model);

    // Main: name (+ check) + id
    const main = document.createElement("div");
    main.className = "mp-row-main";
    const name = document.createElement("div");
    name.className = "mp-row-name";
    const nameText = document.createElement("span");
    nameText.textContent = model.name || model.id;
    const check = document.createElement("span");
    check.className = "mp-row-check";
    check.innerHTML = ICONS.check;
    name.append(nameText, check);
    const id = document.createElement("div");
    id.className = "mp-row-id";
    id.textContent = model.id;
    main.append(name, id);

    // Aside: ctx pill + price
    const aside = document.createElement("div");
    aside.className = "mp-row-aside";
    const ctxText = formatContextLength(model);
    if (ctxText) {
      const ctx = document.createElement("span");
      ctx.className = "mp-row-ctx";
      ctx.innerHTML = `${ICONS.ctx}${ctxText}`;
      aside.appendChild(ctx);
    }
    if (isFree(model)) {
      const free = document.createElement("span");
      free.className = "mp-row-price free";
      free.innerHTML = `${ICONS.bolt}Free`;
      aside.appendChild(free);
    } else {
      const prices = pricePerMTok(model);
      const price = document.createElement("span");
      price.className = "mp-row-price";
      if (prices) {
        price.innerHTML =
          `<span class="mp-price-num">${formatUsd(prices.in)}</span>` +
          '<span class="mp-price-unit"> in</span> · ' +
          `<span class="mp-price-num">${formatUsd(prices.out)}</span>` +
          '<span class="mp-price-unit"> out / MTok</span>';
      } else {
        price.textContent = "—";
      }
      aside.appendChild(price);
    }

    row.append(avatar, main, aside);
    row.addEventListener("click", () => {
      this.currentModelId = model.id;
      this.renderBody();
      this.onSelect?.(model);
    });
    return row;
  }
}
