# Reply Better AI — Privacy Policy

_Last updated: 2026-05-06_

Reply Better AI is a browser extension that improves the text you select with the AI model of your choice. This page describes what data the extension touches, where it goes, and what it doesn't do.

## What we collect

**Nothing.** Reply Better AI has no servers and runs no analytics. There is no telemetry, no usage tracking, no error reporting service, no advertising SDK.

## What you provide

- **Your OpenRouter API key.** Required for the extension to work. Stored in your browser's local extension storage (`browser.storage.local`). It is **not** synced across devices and **not** sent anywhere except OpenRouter.
- **Your custom prompts and snippets.** Stored locally in the same place as the API key.
- **The text you choose to improve.** Sent to OpenRouter's API (`https://openrouter.ai/api/v1/chat/completions`) along with your selected model and the prompt for the chosen style. The extension does not retain a copy.

## Where data goes

- **OpenRouter** (`openrouter.ai`) — every "Improve" call goes here. Your API key is sent in the `Authorization` header. The text you submit is sent in the request body and forwarded by OpenRouter to the model provider you selected (Anthropic, OpenAI, Google, etc.). See [OpenRouter's privacy policy](https://openrouter.ai/privacy) for what they retain.
- **Nowhere else.** The extension makes no other network requests.

The list of available models is fetched from `https://openrouter.ai/api/v1/models` (a public, unauthenticated endpoint) and cached locally for one hour.

## What we never do

- Read or transmit text from web pages you visit, except the specific text you click ✍️ to improve
- Store your API key in cloud-synced storage
- Make network requests to anything other than OpenRouter
- Inject scripts into the page's main JavaScript world
- Track which sites you use the extension on
- Share data with third parties (besides OpenRouter, which you opted into by providing its key)

## Permissions

The extension declares the minimum permissions needed:

- **`storage`** — to save your API key, settings, custom prompts, and snippets locally
- **`https://openrouter.ai/*`** — to talk to the OpenRouter API
- **Content scripts on `http(s)://*/*`** — to inject the inline ✍️ button on any web page; the script runs in an isolated world and cannot read your browsing data outside the text you explicitly improve

The extension does **not** request `tabs`, `activeTab`, `webRequest`, or any other permission that would allow broader access to your browsing.

## Removing your data

Uninstalling the extension removes everything: API key, prompts, snippets, cached model list. There is no off-device data to delete because nothing was ever sent off-device (besides the OpenRouter calls you triggered).

## Changes

Material changes to this policy will be noted in [the GitHub repository](https://github.com/dantnan/reply-better-ai) and the extension's listing pages.

## Questions

Open an issue at [github.com/dantnan/reply-better-ai/issues](https://github.com/dantnan/reply-better-ai/issues).
