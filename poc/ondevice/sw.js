self.addEventListener("install", () => {
  (async () => {
    const has = typeof LanguageModel !== "undefined";
    console.log("[probe-sw] LanguageModel in service worker:", has);
    if (has) {
      try { console.log("[probe-sw] availability:", await LanguageModel.availability()); }
      catch (e) { console.log("[probe-sw] availability threw:", e); }
    }
  })();
});
