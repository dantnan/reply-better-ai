# JavaScript style

Vanilla JS, ES modules, no TypeScript, no framework. The codebase is
small enough that keeping things conventional and obvious is more
valuable than ceremony.

## Modules

- ES modules only (`import` / `export`). No CommonJS, no UMD wrappers.
- One concern per file. If a file grows past ~300 lines, it's almost
  certainly doing too much.
- Re-exports live in `src/lib/browser.js` (the polyfill seam) and
  nowhere else.
- Default exports only when the module has one obvious thing to
  export. Otherwise prefer named exports.

## Naming

| Kind | Convention | Example |
|------|------------|---------|
| File | kebab-case | `model-chip.js`, `system-prompts.js` |
| Class file | PascalCase matching the class | `ModelPicker.js` |
| Function / variable | camelCase | `validateApiKey`, `currentModelId` |
| Class | PascalCase | `OpenRouterError`, `ModelPicker` |
| Constant | SCREAMING_SNAKE_CASE | `DEFAULT_MODEL`, `MAX_INPUT_LENGTH` |
| CSS class | kebab-case, prefixed | `.reply-better-button`, `.mp-row` |
| Storage key | camelCase | `apiKey`, `modelsCache` |
| Message action | camelCase | `improveText`, `ping` |

## Imports

- All imports go at the top of the file.
- Group: third-party first (none currently except polyfill via
  `lib/browser.js`), then `src/lib/*`, then sibling files.
- One symbol per import line is fine; multi-symbol braces are also
  fine — pick what reads best for that file.
- Never import from `chrome.*` or `browser.*` globals. Import from
  `src/lib/browser.js`.

## Constants

Single source of truth. If a string or number appears in two places,
it should be a constant in `src/lib/constants.js`. Current constants:

- `DEFAULT_MODEL`, `DEFAULT_MESSAGE_TYPE`, `RATE_LIMIT_MS`,
  `MAX_INPUT_LENGTH`, `MODELS_CACHE_TTL_MS`, `OPENROUTER_BASE`,
  `REQUEST_TIMEOUT_MS`, `CUSTOM_PROMPT_PREFIX`

Curated lists (e.g. `POPULAR_IDS`) live in `src/data/`.

## Comments

Default: no comment. Only write a comment when **why** is non-obvious:

- A hidden constraint (e.g. "OpenRouter uses dots for Anthropic ids")
- A subtle invariant
- A workaround for a specific bug or platform quirk
- Behaviour that would surprise a reader

Don't:

- Explain WHAT the code does — well-named identifiers do that
- Reference the current task / fix / callers ("used by X", "added
  for the Y flow", "handles the case from issue #123")
- Write multi-paragraph docstrings or multi-line comment blocks —
  one short line, max

If removing a comment wouldn't confuse a future reader, don't write
it.

## Functions

- Pure where possible. Reach for a class only when shared mutable
  state genuinely earns it (we have one: `ModelPicker`).
- Early-return over nesting. Three nesting levels is a smell.
- No "options bag" with > 4 fields without a destructuring named
  signature.

## Async / await

- `async` / `await` everywhere over raw `Promise.then` chains.
- `Promise.all` for independent async work that can run in parallel.
- Surround the right thing in a `try`. Don't wrap whole functions
  in a single try/catch — be specific about which step might fail and
  what to do per-failure-mode. See `error-handling.md`.

## DOM

- Use only safe write APIs: `textContent`, `value`, `replaceChildren`,
  `createElement`, `appendChild`. Never assign to `innerHTML`,
  `outerHTML`, or call `insertAdjacentHTML` with anything other than
  a hardcoded literal — page-supplied and model-supplied content is
  treated as untrusted in our threat model.
- No dynamic code execution. That includes `eval`, the `Function`
  constructor, string-form `setTimeout` / `setInterval`, and the
  legacy stream-write API. The manifest CSP rejects most of these
  anyway; don't try to work around it.
- `querySelector` / `querySelectorAll` over `getElementById` is fine;
  use whichever reads best.

## CSS

- Class names prefix `reply-better-` for content-script-injected
  styles (so they don't collide with host pages) and `mp-` for the
  picker's internal classes.
- Inline styles only in `options.html`'s page-specific block; popup
  and content surfaces use the shared `popup.css`.
- No `!important` unless a host page would otherwise win.

## Defaults and missing values

- For typed reads off `storage.local`, always provide a default at
  the read site. The storage layer doesn't know your defaults.
- For optional function arguments, prefer defaulted destructuring:
  `function foo({ x = 1 } = {})`.
- Coalesce missing API fields with `??` (nullish), not `||` (which
  swallows valid empty strings and 0).

## What NOT to add

- A linter / prettier — the codebase is small enough that style is
  enforced by review. If we ever add one, it must be Biome or
  esbuild's own; nothing else.
- TypeScript — the recommendation today is JSDoc `@typedef` blocks
  at module boundaries (Model, Settings, message protocol) when
  the codebase grows past ~3000 LOC or gains a second contributor.
- Framework dependencies (React, Vue, Svelte). The popup is small
  enough that vanilla DOM is the right tool.
