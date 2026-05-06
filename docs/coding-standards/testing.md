# Testing

Tests live in `tests/` and run with `vitest`. Node 18+ required (vitest
2.x dropped Node 14). Today: 60 tests across 5 files, all
behavioural — assertions on contracts, not implementation details.

```bash
npm test            # one-shot
npm run test:watch  # rebuild on save
```

## What's worth testing

The test suite covers the load-bearing branches:

| Module | Coverage |
|--------|----------|
| `src/lib/openrouter.js` | request shape, all error class mappings, `validateApiKey` discriminated returns, `listModels` normalisation |
| `src/lib/models-cache.js` | TTL hit, expiry refetch, force refresh, stale fallback on fetch error, rethrow when no cache, `validateSelectedModel` for present/missing/offline/no-current-id |
| `src/lib/system-prompts.js` | default fallback, named style, custom prompt by index, out-of-range guard |
| `src/lib/errors.js` | `fromResponse` mapping for 401 / 403 / 404 / 429 / 5xx / 4xx-other / missing body |
| `src/content/snippet-expander.js` | trigger at cursor expansion, no-match no-op, second-snippet match, contentEditable rejection, missing-trigger guard |

What's intentionally not tested:

- DOM rendering of `ModelPicker` — high mock cost, low signal
- Service worker install / startup wiring — testing `addListener`
  mocks isn't worth it
- Content script focus / blur / button injection — would need a real
  DOM; smoke-tested manually in Chrome / Firefox before each release
- One-shot migrations (`migrateFromSync`) — the failure modes already
  log; integration testing this would mostly assert "we called the
  polyfill methods"

## Mocking

`webextension-polyfill` is mocked in every test file that imports
modules using it:

```js
vi.mock("../src/lib/browser.js", () => ({
  default: {
    storage: {
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() },
      sync: { get: vi.fn().mockResolvedValue({}), remove: vi.fn() },
    },
  },
}));
```

For tests that need stateful storage (e.g. `models-cache.test.js`),
build a small fake-storage helper at the top of the file rather than
using a deeper mocking framework. See `tests/models-cache.test.js`
for the pattern.

`global.fetch = vi.fn()` per test, with `beforeEach` resetting it.

## Behavioural over implementation-coupled

Test the contract, not the implementation:

✅ `expect(result.reason).toBe("invalid")`
❌ `expect(internalHelper).toHaveBeenCalledWith(...)` (couples to
internal call structure)

✅ `expect(opts.headers.Authorization).toBe("Bearer sk-test")`
❌ `expect(JSON.parse(opts.body).foo).toBe("bar")` for an internal
field that callers don't depend on

If a refactor that preserves observable behaviour breaks the test,
the test was wrong.

## Adding tests

When a PR adds a branch — a new error class, a new pricing edge case,
a new cache state — it should add at least one test. The threshold is
"would a future regression here be silent?" If yes, test it.

Don't bulk-add tests to hit a coverage number. Each test should
correspond to a behaviour that:

- Has a concrete contract you'd assert on a code review
- Could plausibly regress in a future refactor
- Doesn't duplicate an existing assertion

## When tests fail

- Read the failure first; don't skip-and-fix without understanding.
- A test failing after your refactor is signal — the test was
  encoding a real expectation, or your refactor changed observable
  behaviour. Both deserve thought.
- Don't `// @ts-ignore`-style comment around a failing test. Either
  fix the code, or update the test with a one-line note in the PR
  description explaining why the contract changed.
