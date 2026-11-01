---
layout: ../layouts/Compare.astro
title: "On-Device AI Writing Assistant for Chrome (Gemini Nano) – Reply Better AI"
description: "Rewrite drafts and reply to messages with Chrome's built-in Gemini Nano. Free, no API key, no account, and your text never leaves your computer."
eyebrow: "On-device AI · Gemini Nano"
h1: "A writing assistant that runs inside Chrome, on your computer"
lead: "Chrome now ships its own small AI model, Gemini Nano. Reply Better AI uses it to polish your drafts and write replies without sending your text anywhere. No key, no account, no cost."
checked: "Requirements are from Chrome's built-in AI documentation, checked on November 1, 2026. Google can change them, so check developer.chrome.com for the latest."
faq:
  - q: "Is it really free?"
    a: "Yes. The model runs on your computer, so there is nothing to pay for and no usage limit."
  - q: "Does my text go to Google?"
    a: "No. Generation happens on your device and the extension makes no network request for it. Only the first model download uses the internet."
  - q: "Which languages does it support?"
    a: "Gemini Nano currently supports English, German, Spanish, French and Japanese. For other languages, such as Turkish, switch to a free Groq key or a local Ollama model in settings."
  - q: "Why can't I use it on my computer?"
    a: "Your device has to meet Chrome's requirements (listed above) and run Chrome on desktop. If it doesn't, Reply Better AI can use a free Groq key or your own Ollama server instead."
  - q: "Does it work in Firefox or on my phone?"
    a: "No. Gemini Nano is a Chrome desktop feature. In Firefox, use Groq, OpenRouter or a local model."
---

## How it works

When your browser supports it, Reply Better AI picks the on-device engine automatically. There is nothing to set up.

1. Install the extension and click into any message box.
2. The first time, Chrome downloads Gemini Nano once in the background.
3. After that, rewrites and replies run on your computer. Your text never leaves it.

## What you need

From Chrome's built-in AI documentation:

| | Requirement |
|---|---|
| Browser | Chrome on desktop |
| Operating system | Windows 10 or 11, macOS 13 (Ventura) or newer, Linux, or ChromeOS on a Chromebook Plus |
| Disk space | At least 22 GB free on the drive with your Chrome profile |
| Hardware | A GPU with more than 4 GB of VRAM, or 16 GB of RAM and 4 or more CPU cores |
| Network | Only for the first download, on an unmetered connection |

## When to use something else

Gemini Nano is small, which is why it can run on a laptop. It's good at polishing short emails and messages. For long or tricky replies, or for a language it doesn't support, switch the engine in settings:

- **Groq** for a fast free cloud model, with your own free key.
- **Local (Ollama / LM Studio)** for a bigger model that still stays on your computer.
- **OpenRouter** for Claude, GPT, Gemini and hundreds of other models.

Leave the engine on **Auto** and Reply Better AI uses on-device first, then falls back to the next engine you've set up.
