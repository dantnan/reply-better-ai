// Turns promptfoo JSON results into one comparison row per model:
// average 1-5 rating per judged criterion, pass rate for the hard checks,
// median latency and cost per 1,000 rewrites.
//
// Usage: node evals/summarize-compare.mjs evals/out/compare.json [evals/out/compare-rerun.json ...]
// Later files replace earlier ones for every case they contain, so a rerun of
// failed cases is compared under the same conditions for all models.
import { readFileSync } from "node:fs";
import { keepsFacts } from "./assertions.js";

const files = process.argv.slice(2);
if (!files.length) throw new Error("Pass at least one promptfoo JSON output path.");

const caseKey = r => `${r.vars.style}|${r.vars.text}`;
const merged = new Map();
for (const f of files) {
  const rows = JSON.parse(readFileSync(f, "utf8")).results.results;
  for (const k of new Set(rows.map(caseKey))) for (const key of merged.keys()) if (key.startsWith(`${k}::`)) merged.delete(key);
  for (const r of rows) merged.set(`${caseKey(r)}::${r.provider?.label || r.provider?.id}`, r);
}
const rows = [...merged.values()];

const RATED = ["meaning", "tone", "natural", "length"];
const CHECKS = ["facts", "no-preamble", "rewrite-same-language"];
const byModel = new Map();
let skipped = 0;

for (const r of rows) {
  const output = r.response?.output;
  if (!output || /402|insufficient credits/i.test(String(r.error || ""))) { skipped++; continue; }
  const label = r.provider?.label || r.provider?.id;
  const m = byModel.get(label) || { n: 0, lat: [], cost: 0, rated: {}, checks: {} };
  m.n++;
  if (typeof r.latencyMs === "number") m.lat.push(r.latencyMs);
  m.cost += r.cost || 0;
  for (const c of r.gradingResult?.componentResults || []) {
    const metric = c.assertion?.metric;
    if (RATED.includes(metric)) (m.rated[metric] ||= []).push(1 + 4 * (c.score ?? 0));
    if (CHECKS.includes(metric) && metric !== "facts") (m.checks[metric] ||= []).push(c.pass ? 1 : 0);
  }
  // Recompute with the current rule so older runs get the same facts check.
  (m.checks.facts ||= []).push(keepsFacts(output, { vars: r.vars }).pass ? 1 : 0);
  byModel.set(label, m);
}

const avg = a => (a?.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

const out = [...byModel].map(([label, m]) => {
  const rated = RATED.map(k => avg(m.rated[k]));
  return { label, m, rated, mean: avg(rated) };
}).sort((a, b) => b.mean - a.mean);

const head = ["model", "cases", ...RATED, "avg", ...CHECKS.map(c => `${c} %`), "median ms", "$ / 1k rewrites"];
console.log(`| ${head.join(" | ")} |`);
console.log(`|${head.map(() => "---").join("|")}|`);
for (const { label, m, rated, mean } of out) {
  console.log(`| ${[
    label, m.n,
    ...rated.map(x => x.toFixed(2)), mean.toFixed(2),
    ...CHECKS.map(k => (100 * avg(m.checks[k])).toFixed(0)),
    Math.round(median(m.lat)),
    ((m.cost / m.n) * 1000).toFixed(2),
  ].join(" | ")} |`);
}
if (skipped) console.log(`\nSkipped ${skipped} results with no output or a credits error.`);
