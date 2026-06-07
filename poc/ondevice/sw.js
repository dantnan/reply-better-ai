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

// Popup asks the SW to check the on-device API from the service-worker context
// (the context the real extension uses), so the user can see it without DevTools.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg !== "sw-check") return;
  (async () => {
    const has = typeof LanguageModel !== "undefined";
    let avail = null;
    try { if (has) avail = await LanguageModel.availability(); }
    catch (e) { avail = "threw: " + e; }
    sendResponse({ has, avail });
  })();
  return true; // keep the channel open for the async response
});
