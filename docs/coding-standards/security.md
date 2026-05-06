# Security

Browser extensions ship with privileges most code doesn't have:
read/write access to every page the user visits, persistent storage,
and an API key. This file documents what we do to keep that
trustworthy. A separate `/security-review` skill audits the diff on
each PR — if it flags something, fix it before merge.

## Permissions: principle of least privilege

Current manifest:

- `permissions: ["storage"]`
- `host_permissions: ["https://openrouter.ai/*"]`
- `content_scripts.matches: ["http://*/*", "https://*/*"]`
- No `web_accessible_resources`, no `externally_connectable`, no
  `tabs` / `activeTab`

**Adding a permission requires justification in the PR description.**
Trace each new entry to the concrete API call that needs it. If you
can't, you don't need it.

Things we explicitly avoid:

- `tabs.sendMessage` broadcasts (use `storage.onChanged` instead — see
  the architecture doc)
- `<all_urls>` in `web_accessible_resources` (we expose nothing to
  web pages; the content script icons aren't reachable from page
  context)
- Programmatic `scripting.executeScript` — content scripts are
  declared in the manifest, never injected at runtime

## API key storage

The OpenRouter key lives in `storage.local`, not `storage.sync`. Cloud
sync is the wrong place for a credential — it travels to every browser
profile the user is signed into, and the key is recoverable from the
sync service.

`migrateFromSync` in `src/lib/storage.js` handles the historical case:
v1 of the extension stored the key in sync; on first run after
upgrade, we copy it to local and remove it from sync. Partial-failure
modes (local set OK but sync remove failed) are detected on the next
startup via the `leftoverInSync` check; the cleanup is retried
automatically.

The key is read by the **service worker, popup, and options page**.
**Never** by the content script. Web pages can't read extension-context
storage, but a content script could be tricked into echoing values to
the page if it had access. It doesn't, so it can't.

## Content script ↔ page isolation

The content script runs in the **isolated world**. The page's
JavaScript cannot:

- Read content-script globals
- Call content-script functions
- Listen to content-script-dispatched events outside the page-script
  postMessage channel (which we don't open)

Things to NEVER do:

- Inject script into the page's MAIN world via `script.src` or
  `script.textContent`
- Open a `postMessage` listener without an exact `event.origin` and
  `event.source` check
- Eval anything based on page content
- Pass the API key into any function that runs in MAIN world

## DOM injection

All DOM writes use safe APIs:

- `element.textContent = value` — text only, no HTML parsing
- `element.value = value` — for `<input>` / `<textarea>`
- `element.replaceChildren(...nodes)` — replaces children with
  pre-built nodes
- `createElement` + `appendChild` — for new structure

Never assign to `innerHTML`, `outerHTML`, or call `insertAdjacentHTML`
with anything other than a hardcoded literal. Both the AI response
(from OpenRouter) and the page's text content are treated as untrusted
in our threat model — even though TLS protects the network and the
model is invoked by the user, a compromised upstream or a bad page
snippet should not turn into XSS.

## CSP

The manifest sets:

```
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self';"
}
```

`'unsafe-inline'` and `'unsafe-eval'` are rejected by MV3 by default
and we explicitly keep it that way. Don't add inline `<script>` tags
to popup.html or options.html; bundle into the JS file instead.

## Network

- The only host we contact is `openrouter.ai`. Adding a new host
  requires updating `host_permissions` in BOTH manifests.
- All requests use `Authorization: Bearer ${apiKey}` over HTTPS. No
  cookies, no other auth mechanisms.
- We send `HTTP-Referer: https://github.com/dantnan/reply-better-ai`
  and `X-Title: Reply Better AI` so OpenRouter analytics can attribute
  traffic. These are non-secret and OK to leak.

## Input validation

- The service worker enforces `MAX_INPUT_LENGTH` (50,000 chars) on
  the user's text before sending to OpenRouter. The popup mirrors
  this — both entry points must validate.
- Never trust the URL of the active tab. We don't read it today.
- The content script does NOT trust messages from the page; it only
  responds to its own focus / blur / input / click events on its own
  injected button.

## Secrets and logging

- The API key never appears in `console.log` / `console.error` /
  `console.warn`. Don't add such a log even temporarily; commit it
  and you're disclosing.
- Error messages from OpenRouter (e.g. "Invalid API key") are safe
  to surface; they don't echo the key.
- Don't add telemetry, analytics, Sentry, or any third-party SDK
  without explicit user opt-in. The extension currently ships with
  zero telemetry; the privacy story is part of the value
  proposition.

## Threat model summary

What we defend against:

- A malicious web page trying to read the API key, exfiltrate user
  text, or invoke our background message handler
- A compromised OpenRouter response trying to inject script
- A misbehaving extension on the same browser

What we don't defend against:

- A compromised local machine (the user's own OS / browser)
- A user with developer tools open snooping their own storage

## Pre-merge security checklist

Before merging, verify in `chrome://extensions` → Details:

- [ ] Permissions list shows only what the manifest declares
- [ ] No spurious permissions added by Chrome (e.g. due to a
      content_scripts wildcard expansion)
- [ ] DevTools → Application → Storage shows the API key in
      `storage.local`, NOT in `storage.sync`
- [ ] DevTools → Network shows traffic only to `openrouter.ai`

If any of those fail the bar, don't merge.
