import { describe, it, expect } from "vitest";
import {
  siteKey, isSiteDisabled, withSiteDisabled, withSiteEnabled,
  languageForSite, withSiteLanguage, MAX_LANGUAGE_SITES,
} from "../src/lib/sites.js";
import { LANGUAGES, isLanguage, languageName, onDeviceOutputLanguage } from "../src/lib/languages.js";

describe("siteKey", () => {
  it("lowercases and drops a leading www.", () => {
    expect(siteKey("WWW.LinkedIn.com")).toBe("linkedin.com");
    expect(siteKey("mail.google.com")).toBe("mail.google.com");
    expect(siteKey("")).toBe("");
    expect(siteKey(undefined)).toBe("");
  });
});

describe("turn off on this site", () => {
  it("adds once, sorted, and matches www and bare host alike", () => {
    let list = withSiteDisabled([], "www.reddit.com");
    list = withSiteDisabled(list, "reddit.com");
    list = withSiteDisabled(list, "github.com");
    expect(list).toEqual(["github.com", "reddit.com"]);
    expect(isSiteDisabled(list, "reddit.com")).toBe(true);
    expect(isSiteDisabled(list, "www.reddit.com")).toBe(true);
    expect(isSiteDisabled(list, "old.reddit.com")).toBe(false);
  });

  it("removes a site", () => {
    expect(withSiteEnabled(["github.com", "reddit.com"], "www.reddit.com")).toEqual(["github.com"]);
  });

  it("copes with bad stored values", () => {
    expect(isSiteDisabled(undefined, "a.com")).toBe(false);
    expect(isSiteDisabled(["a.com"], "")).toBe(false);
    expect(withSiteDisabled("junk", "a.com")).toEqual(["a.com"]);
    expect(withSiteEnabled(null, "a.com")).toEqual([]);
  });
});

describe("Write in, per site", () => {
  it("defaults to auto and ignores unknown codes", () => {
    expect(languageForSite({}, "a.com")).toBe("auto");
    expect(languageForSite({ "a.com": "xx" }, "a.com")).toBe("auto");
    expect(languageForSite(undefined, "a.com")).toBe("auto");
    expect(languageForSite({ "a.com": "de" }, "www.a.com")).toBe("de");
  });

  it("does not read inherited keys", () => {
    expect(languageForSite({}, "constructor")).toBe("auto");
  });

  it("stores a choice and removes it again on auto", () => {
    const set = withSiteLanguage({}, "www.a.com", "es");
    expect(set).toEqual({ "a.com": "es" });
    expect(withSiteLanguage(set, "a.com", "auto")).toEqual({});
  });

  it("drops the oldest entries past the cap", () => {
    let map = {};
    for (let i = 0; i < MAX_LANGUAGE_SITES + 5; i++) map = withSiteLanguage(map, `s${i}.com`, "en");
    expect(Object.keys(map)).toHaveLength(MAX_LANGUAGE_SITES);
    expect(map["s0.com"]).toBeUndefined();
    expect(map[`s${MAX_LANGUAGE_SITES + 4}.com`]).toBe("en");
  });
});

describe("languages", () => {
  it("knows its codes", () => {
    expect(LANGUAGES.length).toBeGreaterThan(10);
    expect(isLanguage("tr")).toBe(true);
    expect(isLanguage("auto")).toBe(false);
    expect(isLanguage("toString")).toBe(false);
    expect(languageName("el")).toBe("Greek");
    expect(languageName("nope")).toBe(null);
  });

  it("only asks Gemini Nano for languages it supports", () => {
    expect(onDeviceOutputLanguage("fr")).toBe("fr");
    expect(onDeviceOutputLanguage("tr")).toBe("en");
    expect(onDeviceOutputLanguage(undefined)).toBe("en");
  });
});

import { languageFromInstruction } from "../src/lib/languages.js";

describe("languageFromInstruction", () => {
  it("picks up clear requests in English", () => {
    expect(languageFromInstruction("reply in English")).toBe("en");
    expect(languageFromInstruction("Reply in English, say Wednesday works")).toBe("en");
    expect(languageFromInstruction("say yes but write it in Spanish")).toBe("es");
    expect(languageFromInstruction("translate to German")).toBe("de");
    expect(languageFromInstruction("answer in greek please")).toBe("el");
  });

  it("picks up native phrasings", () => {
    expect(languageFromInstruction("réponds en français")).toBe("fr");
    expect(languageFromInstruction("antworte auf Deutsch")).toBe("de");
    expect(languageFromInstruction("responde en inglés")).toBe("en");
  });

  it("picks up Turkish adverbs next to a verb", () => {
    expect(languageFromInstruction("ingilizce cevap ver, pazartesi gönderirim de")).toBe("en");
    expect(languageFromInstruction("İngilizce yaz")).toBe("en");
    expect(languageFromInstruction("cevabı almanca yaz")).toBe("de");
    expect(languageFromInstruction("yunanca olsun")).toBe("el");
  });

  it("ignores instructions that only mention a language", () => {
    expect(languageFromInstruction("tell him I don't speak German")).toBe(null);
    expect(languageFromInstruction("türkçe bilmiyorum de")).toBe(null);
    expect(languageFromInstruction("we love French food, say thanks")).toBe(null);
    expect(languageFromInstruction("cuma olur de")).toBe(null);
    expect(languageFromInstruction("")).toBe(null);
    expect(languageFromInstruction(undefined)).toBe(null);
  });

  it("does not match inside longer words", () => {
    expect(languageFromInstruction("in englishman style")).toBe(null);
  });
});

import { languageFromDetection } from "../src/lib/languages.js";

describe("languageFromDetection", () => {
  const res = (language, percentage, isReliable = false) => ({ isReliable, languages: [{ language, percentage }] });

  it("accepts a reliable result", () => {
    expect(languageFromDetection(res("de", 60, true), "Hallo")).toBe("de");
  });

  it("accepts a confident guess on a short chat message", () => {
    expect(languageFromDetection(res("en", 100), "Hi, does Friday work for the call?")).toBe("en");
  });

  it("ignores weak guesses and very short text", () => {
    expect(languageFromDetection(res("en", 70), "Hi, does Friday work for the call?")).toBe(null);
    expect(languageFromDetection(res("en", 100), "ok")).toBe(null);
  });

  it("maps regional codes and ignores unlisted languages", () => {
    expect(languageFromDetection(res("zh-Hant", 100, true), "x")).toBe("zh");
    expect(languageFromDetection(res("gl", 100), "Hi Adnan, garbled â€” text")).toBe(null);
  });

  it("copes with empty or odd results", () => {
    expect(languageFromDetection(undefined, "text text text")).toBe(null);
    expect(languageFromDetection({ isReliable: true, languages: [] }, "text")).toBe(null);
  });
});
