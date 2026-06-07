# On-Device (Gemini Nano) POC — Results

_Date: 2026-06-08 · Machine: user's Linux laptop, Chrome 149, 16 cores, Intel Iris Xe (integrated), ~16GB RAM, 216GB free disk_

## Observations

- **Availability (popup):** `available` — out of the box, **no chrome://flags required**.
- **Service worker:** `LanguageModel present: true · availability: available` — the Prompt API is callable from the MV3 **service worker**, so the existing SW-relay architecture works for on-device with no change.
- **Model download:** instant (already present); session ready in ~249 ms (warm).
- **Speed:** first token ~367 ms, full rewrite ~2.2 s for 122 chars. Fast, fully local. Streamed chunks are **deltas** (clean output, no duplication).
- **English quality (good):** "hey team i think the 15th is to risky lets push it to the 18th so QA can finish" → "Team, I think the 15th is too risky. Let's move the deadline to the 18th so QA has sufficient time to complete their work." Grammar/punctuation/fluency fixed, meaning preserved.
- **Turkish quality (acceptable, weaker):** "selam ekip bence 15i cok riskli hadi 18e cekelim ki QA bitirebilsin" → "Merhaba ekip, öncelikle 15 numarayı riskli buluyorum. QA sürecini tamam edebilmek için lütfen 18 numarayı seçelim." Stayed in Turkish and is fluent, **but** misread the dates "15i/18i" (the 15th/18th) as "number 15/18" (meaning change), and "tamam edebilmek" is a minor grammar slip ("tamamlayabilmek"). A larger cloud model would not make these errors.

## Decision: GO (on-device as the free default)

On-device qualifies as the **zero-setup, free, fast, private default** on capable Chrome desktops:
- Available with no flags, works in the service worker, fast, good English quality.

Known caveat: **non-English (Turkish) quality is weaker** — occasional meaning/grammar slips. Mitigations carried into the build:
1. Tighten the on-device system prompt to **preserve dates, numbers, and names exactly** (likely fixes the 15th→"number 15" error).
2. Keep cloud (Groq free / OpenRouter paid) as a **one-tap quality upgrade**, shown transparently ("running on: On-device · free").
3. Do **not** do language-aware routing that forces non-English users to a cloud key — that would break zero-setup-free for exactly our (Turkish) audience. On-device stays the default for everyone; the user upgrades to cloud when they want more nuance.

Caveat on coverage: this is a sample of one (capable) machine. On-device works *well when available*; users where it's unavailable fall back to the cloud engines, as designed.
