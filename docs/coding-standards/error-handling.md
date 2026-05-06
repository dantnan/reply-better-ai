# Error handling

The extension talks to the network, the user, and the host browser.
Every surface has a different right way to fail. The rule is: never
silently swallow, never blame the user for the network, and never
flash a `Promise<undefined>`.

## The error class hierarchy

`src/lib/errors.js` defines one base class and five concrete subclasses:

```
OpenRouterError
├── InvalidKeyError       (HTTP 401 / 403)
├── ModelUnavailableError (HTTP 404)
├── RateLimitError        (HTTP 429 — both server and our client guard)
├── ProviderError         (HTTP 5xx and other non-2xx)
└── NetworkError          (fetch threw — offline / DNS / TLS / abort)
```

Every subclass:

- Sets `name` to the class name (used as a discriminator)
- Sets `status` to the HTTP code (or undefined for `NetworkError`)
- Implements a `userMessage` getter — the English string we show
  the user

Use `fromResponse(response, body)` (in `src/lib/errors.js`) to map a
`Response` + parsed body to the correct subclass. Don't construct
typed errors directly from response code; use the factory.

## Surfacing errors

| Surface | How |
|---------|-----|
| Service worker | `return { error, code, status, model }` from the message handler |
| Content script | `showToast(msg, { type: "error" })` from `button-injector.js` |
| Popup | `showBanner(msg, "error")` (success / info / error variants) |
| Options page | `showStatus(msg, "error")` (auto-hides after 3s) |

Never `alert()`. Never `console.error` as the only feedback to the
user — that's just for developers.

## Discriminated returns over throws at API boundaries

`validateApiKey` returns `{ ok: true } | { ok: false, reason: ... }`.
Callers can distinguish "key is bad" from "couldn't reach OpenRouter"
and react differently — typically:

- `reason: "invalid"` → hard-fail, ask the user to fix it
- `reason: "timeout" | "network"` → save the input anyway, show an
  info banner ("Couldn't reach OpenRouter — saved settings anyway")
- `reason: "provider"` → bubble up the status code

Apply the same pattern to any future call that has more than one
"failed" mode.

## Try/catch placement

- One `try` per logical step. Don't wrap a 50-line function in one
  catch — if `await foo()` fails for a different reason than
  `await bar()`, they each get their own try.
- The catch must do something. `console.warn` + return defaults is
  acceptable only when the user sees the consequence in the UI
  somewhere. Otherwise log AND surface.
- Bare `catch {}` is a code smell; verify the swallow is intentional
  in review.

## Fail-closed at boundaries

When in doubt, fail closed:

- Content script can't load settings → assume `enableInlineButton:
  false` so a user who turned the inline button off doesn't see it
  spuriously appear when storage hiccups.
- Service worker can't validate the saved model offline → return
  `{ valid: true, deferred: true }` rather than asserting "all good"
  and letting the next `improveText` call discover the model is gone.
- API key save can't reach the network → save the key locally with
  an info banner; locking the user out on flaky wifi is worse than
  saving an unverified key.

## Forwarding error metadata

The service worker shapes typed errors into a flat envelope:

```js
return {
  error: err.userMessage || err.message,
  code: err.name,
  status: err.status,
  model: err.model,
};
```

Forward `status` and `model` so the popup can offer a "switch model"
CTA on `code === "ModelUnavailableError"` or "open settings" on
`code === "InvalidKeyError"`. Don't drop fields just because the
current consumer doesn't read them yet.

## What "silent failure" looks like in this codebase

These patterns have shown up in past reviews; flag them in PRs:

- `try { ... } catch { return false }` that loses the reason
- `try { ... } catch (e) { console.warn(e) }` with no UI surface and
  no upstream signal
- Returning a default that's indistinguishable from a successful
  empty result (e.g. `[]` for both "no items" and "fetch failed")
- Empty `catch {}` blocks
- `if (response?.error)` chained without an `else` for the empty case

## Never do

- `alert(message)` — blocks the page, looks ancient
- `throw "string"` — always throw an `Error` (or a typed subclass)
- `console.error(...)` as the only feedback path — invisible to users
- Ignoring `Promise.catch` in a fire-and-forget call without a
  comment explaining why it's safe
