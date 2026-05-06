# Architecture

The extension is a single ES-module source tree (`src/`) bundled by
esbuild into one ready-to-load directory per browser
(`dist/chrome/`, `dist/firefox/`). Two manifests, one codebase, no
runtime branching.

## Layout

```
src/
├── background/
│   └── service-worker.js    # message router, install/startup hooks
├── content/                 # injected into every http(s) page
│   ├── index.js
│   ├── button-injector.js
│   ├── snippet-expander.js
│   └── text-target.js
├── popup/                   # toolbar popup
│   ├── index.js
│   ├── popup.html / popup.css
│   └── components/
│       ├── ModelPicker.js
│       └── model-chip.js
├── options/                 # full-tab settings page
│   ├── index.js
│   └── options.html
├── lib/                     # shared (background + popup + options)
│   ├── browser.js           # webextension-polyfill re-export
│   ├── constants.js
│   ├── errors.js
│   ├── models-cache.js
│   ├── openrouter.js
│   ├── storage.js
│   └── system-prompts.js
└── data/
    └── popular-models.js
```

A few hard rules:

- **No code in `dist/`.** It's a build output. Never edit it; it's
  rebuilt from `src/` on every `npm run build`.
- **No `chrome.*` references in source.** Always go through
  `src/lib/browser.js` (which re-exports `webextension-polyfill`)
  so the same source runs in Chrome and Firefox without if-branches.
- **No imports across surfaces** (background ⇄ popup ⇄ content).
  Each surface is a separate bundled entry point. Anything they need
  to share lives under `src/lib/`. The only cross-surface
  communication is `runtime.sendMessage` and `storage.onChanged`.

## Build pipeline

`build.mjs` is the only build script. It:

1. Wipes `dist/<browser>/`
2. Bundles each entry in `BUNDLES` via esbuild (IIFE format, minified
   in production, sourcemap-inlined in `--watch`)
3. Copies the per-browser manifest (`manifest.<browser>.json` →
   `dist/<browser>/manifest.json`)
4. Copies static files listed in `STATIC_FILES`
5. Copies the `icons/` folder
6. Optionally zips both dists (`--package`)

Targets are `chrome109` and `firefox115` so esbuild can emit modern
syntax without polyfills.

## Manifest pair

Two manifests because Chrome and Firefox MV3 disagree on background
script form:

- **Chrome (MV3)** — `background.service_worker: "service-worker.js"`
- **Firefox (MV3)** — `background.scripts: ["service-worker.js"]`
  plus `browser_specific_settings.gecko` for the AMO id

Everything else (host_permissions, content_scripts, options_ui, CSP)
is identical. **Add new keys to both manifests.** Rule of thumb:
if you edit one, edit the other in the same commit.

## Service worker lifecycle

Chrome MV3 service workers idle out and restart on demand. That has
two consequences for the code:

- **No long-lived in-memory state** in the service worker. Cache via
  `storage.local` or accept that it's lost. The model list cache
  in `src/lib/models-cache.js` follows this.
- **Async `onMessage` handlers must `return true`** synchronously and
  resolve via `sendResponse`. Anything that returns a Promise
  directly without the `return true` will silently drop the response
  on Chrome.

Firefox treats `background.scripts` as an event page rather than a
service worker; it's slightly more forgiving but the same patterns
work.

## Content scripts

Injected into `http://*/*` and `https://*/*` (broad, but necessary
for the inline button feature). They run in the **isolated world** —
the page's JS cannot read their globals.

What content scripts MAY do:

- Read / write `<input>` / `<textarea>` `value`
- Listen to focus / blur / input events
- Send `runtime.sendMessage` to the service worker
- Subscribe to `storage.onChanged` for live settings updates
- Inject DOM elements for the UI button + toast

What content scripts MUST NOT do:

- Hold the API key (it's only read by the service worker / popup /
  options)
- Make network requests directly (route through the service worker)
- Inject scripts into the page's MAIN world
- Use `innerHTML` on anything that isn't a hardcoded literal

## Settings propagation

`storage.onChanged` is the canonical broadcast channel between
contexts. When the popup or options writes a setting, the content
script's listener picks it up and re-renders. This avoids needing the
`tabs` permission for `tabs.sendMessage` broadcasts.

## Adding a new feature

1. Decide which surface owns it (background / content / popup / options).
2. If shared logic is involved, extract a function under `src/lib/`.
3. Update tests in `tests/` for any new branch.
4. If you added a new permission or host, justify it in the commit
   body and the PR description.
5. Run `npm run build && npm test` before committing.
