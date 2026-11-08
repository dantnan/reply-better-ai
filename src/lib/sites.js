import { isLanguage } from "./languages.js";

// Per-site settings key: the hostname without a leading "www.", so
// www.linkedin.com and linkedin.com share one entry. Other subdomains stay
// separate (mail.google.com is not docs.google.com).
export function siteKey(hostname) {
  return String(hostname || "").trim().toLowerCase().replace(/^www\./, "");
}

// ── "Turn off on this site" ────────────────────────────────────────────────

export function isSiteDisabled(disabledSites, hostname) {
  const key = siteKey(hostname);
  return !!key && Array.isArray(disabledSites) && disabledSites.includes(key);
}

export function withSiteDisabled(disabledSites, hostname) {
  const list = Array.isArray(disabledSites) ? disabledSites.filter(s => typeof s === "string") : [];
  const key = siteKey(hostname);
  if (!key || list.includes(key)) return list;
  return [...list, key].sort();
}

export function withSiteEnabled(disabledSites, hostname) {
  const key = siteKey(hostname);
  return (Array.isArray(disabledSites) ? disabledSites : []).filter(s => s !== key);
}

// ── "Write in" remembered per site ─────────────────────────────────────────

// Enough for every site a person writes on; the oldest entries drop first.
export const MAX_LANGUAGE_SITES = 200;

export function languageForSite(languageBySite, hostname) {
  const code = languageBySite && typeof languageBySite === "object"
    && Object.prototype.hasOwnProperty.call(languageBySite, siteKey(hostname))
    ? languageBySite[siteKey(hostname)] : undefined;
  return isLanguage(code) ? code : "auto";
}

// "auto" removes the entry, so the map only holds real choices.
export function withSiteLanguage(languageBySite, hostname, code) {
  const key = siteKey(hostname);
  const next = {};
  for (const [k, v] of Object.entries(languageBySite && typeof languageBySite === "object" ? languageBySite : {})) {
    if (k !== key && isLanguage(v)) next[k] = v;
  }
  if (key && isLanguage(code)) next[key] = code;
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_LANGUAGE_SITES))) delete next[k];
  return next;
}
