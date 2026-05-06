# Reply Better AI

Improve your writing anywhere on the web with the AI model of your choice. Pick from 500+ models on OpenRouter — Claude, GPT, Gemini, DeepSeek, Llama, and more — with a searchable picker, free/paid filtering, and live pricing inside the extension.

[![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-orange)](https://addons.mozilla.org/en-US/firefox/addon/reply-better-ai/)
[![Demo Video](https://img.shields.io/badge/Demo-Video-red)](https://www.loom.com/share/b8781d769fb940d7a1d8aff09b6f1648?sid=26fb5f18-27af-4938-bbc9-fe952a3e211e)
[![GitHub](https://img.shields.io/github/license/dantnan/reply-better-ai)](https://github.com/dantnan/reply-better-ai)

## Features

- One-click text improvement on any website (Gmail, Twitter/X, LinkedIn, etc.)
- Dynamic model picker: Popular / Free / All tabs, live pricing, context window, search, provider filter
- Multiple writing styles: Professional, Friendly, Customer Service, Concise
- Custom prompts and reusable text snippets (TextBlaze-style triggers)
- Cross-browser: single source builds for Chrome and Firefox
- Privacy-focused: API key stored in `storage.local`, traffic only goes to OpenRouter

## Install

### Firefox

[Reply Better AI on AMO](https://addons.mozilla.org/en-US/firefox/addon/reply-better-ai/) — install in one click.

### Chrome (developer load, Web Store coming)

1. Run `npm install && npm run build` (or grab a `dist/chrome` zip from a release).
2. Go to `chrome://extensions`, toggle **Developer mode** on.
3. Click **Load unpacked** and pick the `dist/chrome/` folder.

### Get your OpenRouter key

1. Visit [openrouter.ai/keys](https://openrouter.ai/keys).
2. Create a free account.
3. Generate an API key.
4. Paste it into the extension's settings.

OpenRouter has both free and paid models. Free models are flagged in the picker; paid models bill per-token directly to your OpenRouter account.

## Usage

**Popup:** click the toolbar icon → paste text → choose a style → **Improve Message**.

**Inline:** focus any text field on a webpage, an ✍️ button appears in the corner; click it to rewrite the field's content using your default style.

**Snippets:** in the popup's **Settings** panel, define triggers like `/welcome` that expand into longer text when typed.

## Develop

Requires Node 18+.

```bash
git clone https://github.com/dantnan/reply-better-ai
cd reply-better-ai
npm install
npm run build         # produces dist/chrome and dist/firefox
npm run watch         # rebuild on save
npm test              # vitest unit tests
npm run package       # zips both dists for store submission
```

### Layout

```
src/
├── background/service-worker.js   # message handler, install/startup hooks
├── content/                        # injected into web pages
│   ├── index.js
│   ├── button-injector.js          # inline ✍️ button DOM
│   ├── snippet-expander.js
│   └── text-target.js              # textarea/contentEditable helpers
├── popup/                          # toolbar popup
│   ├── index.js
│   ├── popup.html / popup.css
│   └── components/ModelPicker.js
├── options/                        # full-tab settings page
│   ├── index.js
│   └── options.html
├── lib/                            # shared modules
│   ├── browser.js                  # webextension-polyfill re-export
│   ├── storage.js                  # storage.local wrapper + migration
│   ├── openrouter.js               # OpenRouter API client
│   ├── models-cache.js             # 1h TTL list + validation + formatting
│   ├── system-prompts.js           # default + custom prompt resolver
│   ├── errors.js                   # typed error classes with userMessage
│   └── constants.js
└── data/popular-models.js          # curated "Popular" tab list
```

`build.mjs` bundles each entry with esbuild and emits per-browser
manifests (`manifest.chrome.json`, `manifest.firefox.json`) into
`dist/<browser>/`.

### Coding standards

Project conventions live in [`docs/coding-standards/`](./docs/coding-standards/):

- [Architecture](./docs/coding-standards/architecture.md)
- [JavaScript style](./docs/coding-standards/javascript-style.md)
- [Error handling](./docs/coding-standards/error-handling.md)
- [Security](./docs/coding-standards/security.md)
- [Testing](./docs/coding-standards/testing.md)

Read these before opening a PR.

## License

MIT — see [LICENSE](LICENSE).
