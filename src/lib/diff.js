// Word/whitespace-level LCS diff between two strings.
// Returns an ordered list of { type: "eq" | "ins" | "del", text } segments:
// "eq" = unchanged, "ins" = added in `after`, "del" = removed from `before`.
// Pure and DOM-free so it can be unit-tested; the popup renders the segments.
export function diffWords(before, after) {
  const tokenize = s => s.match(/\s+|[^\s]+/g) || [];
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;

  // dp[i][j] = LCS length of a[i..] and b[j..]
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const segments = [];
  const push = (type, text) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.text += text;
    else segments.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("eq", a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", a[i]); i++; }
    else { push("ins", b[j]); j++; }
  }
  while (i < n) { push("del", a[i]); i++; }
  while (j < m) { push("ins", b[j]); j++; }
  return segments;
}
