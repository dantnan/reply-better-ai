# Reply Better AI — Privacy Policy

_Last updated: 2026-06-05_

Reply Better AI is a browser extension that improves the text you write and helps you reply in context, using the AI model of your choice. This page describes what data the extension touches, where it goes, and what it doesn't do.

## What the developer collects

**Nothing.** Reply Better AI has no servers and runs no analytics. There is no telemetry, no usage tracking, no error reporting service, and no advertising SDK. The developer never receives your text, your API key, or any usage data.

What the extension *does* send, on your behalf and only when you ask, is your text going to OpenRouter using your own API key. That is the product's purpose. It is described in full below. (Note: app stores define "collect" as transmitting data off your device to anyone, including a third-party API you chose, so the store listings disclose these data types even though the developer receives none of it.)

## What you provide

- **Your OpenRouter API key.** Required for the extension to work. Stored in your browser's local extension storage (`browser.storage.local`). It is **not** synced across devices and **not** sent anywhere except OpenRouter. Like all browser-extension storage, it is held unencrypted in your browser profile on disk; if your device is compromised, revoke the key at [openrouter.ai/keys](https://openrouter.ai/keys).
- **Your custom prompts and snippets.** Stored locally in the same place as the API key.
- **The text you improve.** When you improve a draft, that text is sent to OpenRouter with your selected model and the prompt for the chosen style. The extension keeps no copy.
- **The conversation you reply to (reply mode).** When you ask the extension to draft a reply, it sends the conversation text you are replying to so the model can respond in context. That text is either the text you selected on the page, or — if you click **"Use page text"** — the conversation text from the area around the message box (up to the last ~6000 characters). It is sent to OpenRouter together with your tone choice and any instruction you type, exactly like the improve feature. Nothing is stored. The first time you use reply mode, the panel shows a one-time notice that selected text is sent to your chosen model via OpenRouter.

## Where data goes

- **OpenRouter** (`openrouter.ai`) — every Improve and Reply call goes here. Your API key is sent in the `Authorization` header. The text you submit is sent in the request body and forwarded by OpenRouter to the model provider you selected (Anthropic, OpenAI, Google, etc.). Each request also includes two fixed identification headers (`HTTP-Referer` set to this project's GitHub URL, and `X-Title` set to the app name) so OpenRouter can attribute traffic to this extension; they contain no personal data and do not include the page you are on. See [OpenRouter's privacy policy](https://openrouter.ai/privacy) for what they retain.
- **Nowhere else.** The extension makes no other network requests.

The list of available models is fetched from `https://openrouter.ai/api/v1/models` (a public, unauthenticated endpoint) and cached locally for one hour.

## What we never do

- Read or transmit text from web pages you visit, except the text you select or explicitly capture with **"Use page text"** for the improve and reply features
- Send your text, key, or any usage data to a developer-controlled server (there is none)
- Store your API key in cloud-synced storage
- Make network requests to anything other than OpenRouter
- Inject scripts into the page's main JavaScript world
- Track which sites you use the extension on
- Share data with third parties (besides OpenRouter, which you opted into by providing its key)

## Permissions

The extension declares the minimum permissions needed:

- **`storage`** — to save your API key, settings, custom prompts, and snippets locally
- **`https://openrouter.ai/*`** — to talk to the OpenRouter API
- **Content scripts on `http(s)://*/*`** — to show the inline ✍️ button on any web page where you write; the script runs in an isolated world and reads page text only when you act (clicking the button, selecting text to reply to, or capturing page text). It never silently scrapes pages.

The extension does **not** request `tabs`, `activeTab`, `webRequest`, or any other permission that would allow broader access to your browsing.

## Removing your data

Uninstalling the extension removes everything: API key, prompts, snippets, cached model list. There is no off-device data to delete because nothing was ever sent off-device (besides the OpenRouter calls you triggered).

## Changes

Material changes to this policy will be noted in [the GitHub repository](https://github.com/dantnan/reply-better-ai) and the extension's listing pages.

## Questions

Open an issue at [github.com/dantnan/reply-better-ai/issues](https://github.com/dantnan/reply-better-ai/issues).
