# Local LLM setup (Ollama / LM Studio)

Reply Better AI can run entirely on your own machine using a local
OpenAI-compatible server. It's **private** (text never leaves your computer),
**offline**, and needs **no API key**. This works with [Ollama](https://ollama.com),
[LM Studio](https://lmstudio.ai), and any other OpenAI-compatible local server
(llama.cpp, vLLM, LiteLLM, …).

## Quick start

1. Install and start your server, and pull/load at least one model (below).
2. Allow the extension to talk to it (CORS — below; this is the step people miss).
3. In the extension: **Settings → Engine → Local (Ollama / LM Studio)**.
4. Open the **Local server** section, click a preset (**Ollama** or **LM Studio**),
   then pick a model from the dropdown. The status line shows `● Connected · N models`.

---

## Ollama

```bash
# install: https://ollama.com/download
ollama pull llama3.2        # or any model you like
ollama serve                # serves on http://localhost:11434
```

Default base URL (Ollama preset): `http://localhost:11434/v1`

### CORS

Ollama's default only allows requests from `127.0.0.1`/`0.0.0.0`, **not** browser
extensions. You need to allow the extension origins:

```bash
# macOS/Linux — set for the running server
OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" ollama serve
```

- **macOS app:** `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*,moz-extension://*"` then restart Ollama.
- **Windows:** set `OLLAMA_ORIGINS` to the same value in *Environment Variables*, then restart Ollama.

> **Chrome note:** Chrome treats the extension's background request with host
> permissions as CORS-exempt, so Ollama often works on Chrome **without** setting
> `OLLAMA_ORIGINS`. **Firefox does not** — there you must set it (the
> `moz-extension://` origin is a per-install UUID, so the `moz-extension://*`
> wildcard is required).

Models load on demand, so the **first** request after the server starts can take
a few seconds while the model loads — that's normal.

---

## LM Studio

1. Open LM Studio → **Developer** tab (or press `Ctrl/Cmd+2`).
2. Download a model and **load** it (LM Studio needs a model loaded before it can
   answer, unless you've enabled Just-In-Time loading).
3. **Start the server.** Default: `http://localhost:1234`.
4. **Enable CORS** — this is **OFF by default** and the server will reject every
   browser request until you turn it on (Server Settings → *Enable CORS*, or
   `lms server start --cors`).

Default base URL (LM Studio preset): `http://localhost:1234/v1`

---

## Troubleshooting

| Status / error | Cause | Fix |
|---|---|---|
| `○ Can't reach the server` | Server not running, wrong URL/port, or CORS blocked | Start the server; confirm the base URL; **enable CORS** (LM Studio) or set `OLLAMA_ORIGINS` (Ollama, esp. on Firefox). |
| `○ Reachable, but no models` | No model pulled (Ollama) / loaded (LM Studio) | `ollama pull <model>`, or load a model in LM Studio. |
| "Pick a local model in settings first" | Engine is Local but no model chosen | Choose a model in the **Local server** section. |
| First request is slow | Ollama is loading the model on demand | Expected; subsequent requests are fast. |

## Notes

- The base URL must end in `/v1` (the OpenAI-compatible path).
- LM Studio supports an optional server API key; this extension sends requests
  **without** a key (the default). If you've enabled a key in LM Studio, disable
  it for use here.
- A custom server on another port? Pick **Custom** and enter its `…/v1` URL.
