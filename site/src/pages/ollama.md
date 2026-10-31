---
layout: ../layouts/Compare.astro
title: "Ollama Browser Extension for Writing and Replies – Reply Better AI"
description: "Use your own Ollama or LM Studio model to rewrite drafts and reply to messages in any website. Free, no API key, and your text never leaves your computer."
eyebrow: "Local AI · Ollama · LM Studio"
h1: "Use Ollama to write and reply on any website"
lead: "Reply Better AI connects to the Ollama or LM Studio server on your own machine. Select a message, get a reply. Type a draft, get a cleaner version. Nothing goes to the cloud."
faq:
  - q: "Do I need an API key?"
    a: "No. The extension talks to your local server without a key. If you turned on an API key in LM Studio, turn it off for this."
  - q: "Which models work?"
    a: "Any chat model your Ollama or LM Studio server can run. The extension lists the models you have installed and you pick one. Smaller models answer faster, bigger ones write better."
  - q: "Does it work in Firefox?"
    a: "Yes, but Firefox needs the OLLAMA_ORIGINS step below. Chrome usually works without it."
  - q: "Does it work offline?"
    a: "Yes. Once the model is downloaded, your server and the extension don't need the internet."
  - q: "Can I use a server on another port or machine?"
    a: "Pick Custom in the Local server settings and enter its base URL. It has to be OpenAI-compatible and end in /v1, which covers llama.cpp, vLLM and LiteLLM too."
---

## Why run it locally

**Private.** Your drafts and the messages you reply to stay on your computer. There is no account and no cloud provider in between.

**Free and unlimited.** You're running the model, so there is no quota and no bill.

**Your model, your choice.** Use whatever model you already like in Ollama or LM Studio, and switch any time.

## Set it up with Ollama

1. Install Ollama from ollama.com/download and pull a model:

```bash
ollama pull llama3.2
ollama serve
```

2. Allow the extension to reach the server. Ollama only accepts requests from localhost by default, so browser extensions get blocked:

```bash
OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" ollama serve
```

On the macOS app, run `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*,moz-extension://*"` and restart Ollama. On Windows, add `OLLAMA_ORIGINS` with the same value in Environment Variables and restart Ollama. Chrome often works without this step. Firefox always needs it.

3. In the extension, open **Settings → Engine → Local (Ollama / LM Studio)**, click the **Ollama** preset and pick a model. The status line should show "Connected".

The first request after starting the server can take a few seconds while the model loads. After that it's fast.

## Set it up with LM Studio

1. Open the **Developer** tab, download a model and load it.
2. Start the server. It runs on `http://localhost:1234` by default.
3. Turn on **Enable CORS** in the server settings. It's off by default, and the server rejects every browser request until you turn it on.
4. In the extension, pick **Local**, click the **LM Studio** preset and choose your model.

## If it doesn't connect

| What you see | What to do |
|---|---|
| Can't reach the server | Check the server is running and the URL ends in `/v1`. Turn on CORS in LM Studio, or set `OLLAMA_ORIGINS` for Ollama. |
| Reachable, but no models | Pull a model in Ollama, or load one in LM Studio. |
| First request is slow | Ollama is loading the model. The next ones are fast. |
