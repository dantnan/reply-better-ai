# Reply Better AI — Privacy Policy

_Last updated: 2026-06-08_

Reply Better AI is a browser extension that improves the text you write and helps you reply in context, using the AI engine of your choice — including a free, private, on-device option. This page describes what data the extension touches, where it goes, and what it doesn't do.

## What the developer collects

**Nothing.** Reply Better AI has no servers and runs no analytics. There is no telemetry, no usage tracking, no error reporting service, and no advertising SDK. The developer never receives your text, your API keys, or any usage data.

What the extension *does* do, on your behalf and only when you ask, is process your text with the engine you chose (below). For the on-device engine, that means nothing leaves your computer. For a cloud engine, your text is sent to that provider using your own key. (Note: app stores define "collect" as transmitting data off your device to anyone, including a third-party API you chose, so the store listings disclose these data types even though the developer receives none of it — and the on-device engine transmits nothing at all.)

## Engines

You choose where your text is processed (Settings → Engine; "Auto" picks the best available):

- **On-device (Gemini Nano) — free, private.** Runs entirely inside Chrome on your computer. Your text **never leaves your device**, there is no API key, and no network request is made to generate the result. This is the most private option and the default when your device supports it.
- **Local (Ollama / LM Studio) — free, private.** Your text is sent only to an OpenAI-compatible server you run on your own machine (`localhost`); it stays on your computer, with no API key and no third party. You set the server URL in settings.
- **Groq — free.** Your text is sent to Groq (`api.groq.com`) using **your own** free Groq API key.
- **OpenRouter — premium.** Your text is sent to OpenRouter (`openrouter.ai`) using **your own** key, and forwarded to the model provider you picked (Anthropic, OpenAI, Google, etc.).

## What you provide

- **Your API key(s).** An OpenRouter key and/or a free Groq key, depending on which cloud engine you use. The on-device engine needs **no key**. Keys are stored in your browser's local extension storage (`browser.storage.local`), **not** synced across devices, and each is sent **only** to its own provider in the `Authorization` header. Like all browser-extension storage, they're held unencrypted in your browser profile on disk; if your device is compromised, revoke the keys ([openrouter.ai/keys](https://openrouter.ai/keys), [console.groq.com/keys](https://console.groq.com/keys)).
- **Your custom prompts and snippets.** Stored locally, same place as the keys.
- **The text you improve.** Sent to the active engine (on-device → stays local; Groq/OpenRouter → that provider). The extension keeps no copy.
- **The conversation you reply to (reply mode).** When you ask for a reply, it sends the conversation text you are replying to so the model can respond in context — either the text you selected on the page, or, if you click **"Use page text"**, the conversation text from the area around the message box (up to the last ~6000 characters), together with your tone choice and any instruction you type. With the on-device engine this stays on your device; with a cloud engine it goes to that provider. Nothing is stored. A one-time notice explains this the first time you use reply mode.

## Where data goes

It depends on the active engine:

- **On-device:** nowhere. Generation happens locally; no network request is made.
- **Local** (`localhost` / `127.0.0.1`): your text goes only to the OpenAI-compatible server you run yourself; it stays on your machine, with no key and no third party.
- **Groq** (`api.groq.com`): your text + your Groq key (Authorization header), when the Groq engine is active.
- **OpenRouter** (`openrouter.ai`): your text + your OpenRouter key, forwarded to your chosen model provider. Each request also includes two fixed identification headers (`HTTP-Referer` = this project's GitHub URL, `X-Title` = the app name) for app attribution; they contain no personal data and do not include the page you are on.
- **Nowhere else.** No developer server, no analytics.

The OpenRouter model list is fetched from `https://openrouter.ai/api/v1/models` (public, unauthenticated) and cached locally for one hour. Remaining-quota numbers shown in settings come from the provider's own API responses (Groq rate-limit headers; OpenRouter's key-info endpoint) — read for display only.

## What we never do

- Read or transmit text from web pages you visit, except the text you select or explicitly capture with **"Use page text"** for the improve and reply features
- Send your text, keys, or any usage data to a developer-controlled server (there is none)
- Store your API keys in cloud-synced storage
- Make network requests to anything other than the AI provider you chose (OpenRouter or Groq) — and the on-device engine makes none at all
- Inject scripts into the page's main JavaScript world
- Track which sites you use the extension on
- Share data with third parties (besides the AI provider you opted into by providing its key)

## Permissions

The extension declares the minimum permissions needed:

- **`storage`** — to save your API keys, settings, custom prompts, and snippets locally
- **`https://openrouter.ai/*`**, **`https://api.groq.com/*`**, and **`http://localhost/*` + `http://127.0.0.1/*`** — to talk to the AI provider you choose: the cloud providers, or an OpenAI-compatible server you run locally. Only contacted when that engine is active; the on-device engine needs no host access.
- **Content scripts on `http(s)://*/*`** — to show the inline ✍️ button on any web page where you write; the script runs in an isolated world and reads page text only when you act (clicking the button, selecting text to reply to, or capturing page text). It never silently scrapes pages.

The extension does **not** request `tabs`, `activeTab`, `webRequest`, or any other permission that would allow broader access to your browsing.

## Removing your data

Uninstalling the extension removes everything: API keys, prompts, snippets, cached model list. There is no off-device data to delete because nothing was ever sent off-device (besides the cloud calls you triggered, if any).

## Changes

Material changes to this policy will be noted in [the GitHub repository](https://github.com/dantnan/reply-better-ai) and the extension's listing pages.

## Questions

Open an issue at [github.com/dantnan/reply-better-ai/issues](https://github.com/dantnan/reply-better-ai/issues).
