const $ = id => document.getElementById(id);
const log = m => { $("log").textContent += m + "\n"; };
const SYSTEM = "You are an expert editor. Improve the given message: fix grammar and spelling, tighten the wording, and make it clear and natural while preserving the meaning and intent. Output ONLY the improved message, with no preamble.";

let session = null;

(async () => {
  if (typeof LanguageModel === "undefined") { $("avail").textContent = "LanguageModel UNDEFINED in popup"; return; }
  try { $("avail").textContent = await LanguageModel.availability(); }
  catch (e) { $("avail").textContent = "availability() threw: " + e; }
})();

$("prepare").onclick = async () => {
  if (typeof LanguageModel === "undefined") { log("LanguageModel undefined"); return; }
  const t0 = performance.now();
  try {
    session = await LanguageModel.create({
      initialPrompts: [{ role: "system", content: SYSTEM }],
      monitor(m) { m.addEventListener("downloadprogress", e => log("download " + Math.round(e.loaded * 100) + "%")); },
    });
    log("session ready in " + Math.round(performance.now() - t0) + " ms");
    $("avail").textContent = await LanguageModel.availability();
  } catch (e) { log("create() error: " + e); }
};

$("run").onclick = async () => {
  if (typeof LanguageModel === "undefined") { log("LanguageModel undefined"); return; }
  try {
    if (!session) {
      session = await LanguageModel.create({ initialPrompts: [{ role: "system", content: SYSTEM }] });
    }
    $("out").textContent = "";
    const t0 = performance.now();
    let first = 0, full = "";
    const stream = session.promptStreaming($("in").value);
    for await (const chunk of stream) {
      if (!first) { first = performance.now(); log("first token in " + Math.round(first - t0) + " ms"); }
      // NOTE: confirm whether chunk is a delta or cumulative — adjust if output duplicates.
      full += chunk;
      $("out").textContent = full;
    }
    log("done in " + Math.round(performance.now() - t0) + " ms, " + full.length + " chars");
  } catch (e) { log("prompt error: " + e); }
};
