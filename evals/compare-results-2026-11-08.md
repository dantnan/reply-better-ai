# Model comparison, improve mode (8 Nov 2026)

Config: `evals/compare-config.yaml` (30 drafts × 2 styles × 5 models). Judge: `anthropic/claude-sonnet-5.5`. All models through OpenRouter, `max_tokens: 4000`, reasoning text hidden (the extension only reads the message content).

Final numbers come from the second run (`compare-rerun.json`, exported from the promptfoo database after the run was stopped). 4 of ~300 rewrites failed on credits and are left out. Summary: `node evals/summarize-compare.mjs evals/out/compare.json evals/out/compare-rerun.json`.

## Results

Names and a few personal details in the test drafts were replaced with made-up ones after this run, for privacy. The numbers were measured on the earlier wording; the structure of every draft is the same.

Ratings are the judge's 1-5 average. Checks are pass rates.

| model | meaning | tone | natural | length | avg | facts % | rewrite, same language % | median ms | $ / 1k rewrites |
|---|---|---|---|---|---|---|---|---|---|
| gpt-5.4-mini | 4.96 | 3.80 | 4.75 | 4.99 | **4.62** | 100 | 100 | 1908 | 0.30 |
| haiku-5.5 | 4.66 | 4.30 | 4.07 | 4.87 | **4.48** | 100 | 97 | 1524 | **0.06** |
| gemini-3.6-flash | 4.55 | 4.67 | 3.61 | 4.76 | 4.40 | 100 | 100 | 5208 | 2.59 |
| haiku-4.5 (current default) | 4.51 | 4.37 | 3.63 | 4.83 | 4.34 | 100 | 100 | 1904 | 0.43 |
| llama-3.3-70b (Groq tier) | 4.46 | 4.29 | 3.47 | 4.67 | 4.23 | 100 | 100 | 1463 | 0.13 |

Tone by style:

| model | improve | professional |
|---|---|---|
| gemini-3.6-flash | 4.40 | **4.86** |
| gpt-5.4-mini | **4.62** | 3.39 |
| haiku-4.5 | 4.32 | 4.46 |
| haiku-5.5 | 4.47 | 4.14 |
| llama-3.3-70b | 4.05 | 4.51 |

## What it says

- **Haiku 5.5 is the best default.** Better than the current Haiku 4.5 on average (4.48 vs 4.34) and clearly more natural (4.07 vs 3.63), faster (1.5 s vs 1.9 s) and about **7× cheaper**.
- **GPT-5.4 mini writes the most natural text but ignores the "professional" style**: it mostly fixes capitalization and leaves casual drafts casual (tone 3.39). Great for improve, weak as one model for every style.
- **Gemini 3.6 Flash is best at professional tone** but is the slowest (5.2 s) and by far the most expensive, because it spends hidden reasoning tokens on a simple rewrite.
- **Llama 3.3 70B** (free Groq users) is the least natural (3.47): it turns casual drafts stiff and formal.
- Facts (numbers, links) survived in every model once number words like "three" / "üç" were accepted.

## Limits

- 60 cases. Differences under ~0.2 points are not reliable at this size.
- The judge is a Claude model and may favour Claude outputs; GPT still ranked first overall. A second judge would make this stronger.
- The professional style had a few duplicate rows in the database export (33-37 instead of 30 per model); averages are barely affected.

## Cost

About $9.50 in OpenRouter credits over the day, almost all of it the judge (~1,500 ratings per full run, run twice because `--filter-errors-only` re-ran nearly every case). The rewrites themselves cost well under $1. Lesson for next time: judge cost dominates, so test the judge on a small set first and avoid full reruns.
