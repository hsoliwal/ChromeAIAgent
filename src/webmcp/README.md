# Opt-in WebMCP page-tool consumer (experimental)

This module adds a page-side WebMCP consumer **without enabling it** in the normal
ChromeAIAgent UI or service worker. No polyfill is imported into extension scope,
no new host permissions are requested and no backend MCP transport is implied.
The extension and the page are separate security principals.

## Integration ownership

In the extension service worker, an explicitly approved feature can load:

```js
importScripts('src/webmcp/tool-schema.js', 'src/webmcp/page-tool-adapter.js');
const adapter = new WebMcpPageToolAdapter(chrome, async request => {
  // Implement extension-owned per-tab/origin approval here. Deny by default;
  // a page message, tool annotation or inferred user intent is not approval.
  return false;
});
```

Only invoke `discover({tabId, expectedOrigin})` and then
`execute({tabId, expectedOrigin, name, signature, documentId, input, timeoutMs, deadlineEpochMs})` after
operator authorization. The `signature` is obtained from discovery; it detects
metadata changes, but **cannot establish immutable tool identity** across calls.
The actual execution rediscovers and executes the opaque native/polyfill tool
object in the **same MAIN-world invocation**. The Chrome 106+ document ID
from discovery is required for execution; navigation invalidates the call.
Ambiguous names are rejected.

`deadlineEpochMs` is optional. A reviewed UI may pass the original approval
deadline as `performance.timeOrigin + performance.now() + remainingMs`;
delayed tab checks, authorization, injection and rediscovery cannot extend it.
The adapter caps the deadline by its own `timeoutMs` budget. Existing calls
that omit the new option retain the same entry point and validation contract.

The tool's `readOnlyHint` is untrusted metadata, not a permission assertion.
Even apparently read-only tools can have side effects: consequently the caller
must confirm each execution and never auto-forward results to local or cloud AI.
The callback's permission decision belongs to the extension, not to the page.
`chrome.scripting.executeScript` returns data directly without a `window.postMessage`
listener, nonce or page-to-extension privilege relay.

## Scope and limits

- Secure HTTPS or loopback origin; same-origin discovery only; top frame only.
- Any missing WebMCP API is an explicit failure. A polyfill must be installed by
  the owning page beforehand, and native contexts are not replaced.
- JSON argument objects only, maximum 64 KiB; output maximum 256 KiB; 64 tools;
  metadata signature maximum 16 KiB. Byte limits count UTF-8. The 1–10,000 ms
  execution budget includes tab/authorization checks and page rediscovery;
  invocation does not receive a new budget after a delay. A real `AbortSignal`
  accompanies the callback; cancellation requests cannot roll back side effects.
- Input and optional output JSON Schema are checked by `tool-schema.js` against a
  deliberately small fail-closed dialect (type, properties, required,
  additionalProperties boolean, items, enum, min/max bounds). `$ref`, `oneOf`,
  `anyOf`, `pattern`, formats and other advanced keywords are **not** supported.
  Output validation runs after execution and cannot prevent prior side effects.
- Cross-origin frames, browser-managed AI sessions, local host process access,
  Cloud MCP, native/polyfill mixed frames and declarative form tools are not
  authorized or implemented here.
- The input signature is a metadata guard, not a registration ID. Re-registration
  of a tool with identical metadata cannot be proven absent between discovery and
  execution. A future browser/version-qualified stable-identity API is needed for
  high-risk operations; keep them disabled.
- The MAIN-world clock, APIs and callback belong to the untrusted page. Timing
  checks bound cooperative execution and late initiation; they do not sandbox
  hostile page code or guarantee that a running callback honors cancellation.
- The module does not yet provide a user-facing opt-in control; it is a library
  for a separately reviewed UI integration, not an active extension feature.

## Local test

`node --test tests/webmcp-contract.test.js` uses only Node built-ins and fake
browser APIs. It proves refusal/validation/AbortSignal contracts for the
JavaScript adapter, **not** real Chrome MV3 injection, WebMCP conformance, user
activation or browser-mediated permission prompts. Browser qualification
requires HTTPS/localhost fixtures and a supported Chromium build, plus upstream
WebMCP WPT/native/polyfill tests at pinned versions.

The repository's MIT license applies to this optional module. Preserve existing
provenance and do not import polyfill source without an upstream license audit.

## Qualification snapshot (2026-11-22)

This is still an **unwired, default-deny module**, not a production extension feature.
The extension-only authorization callback must separately approve discovery and
each execution; a WebMCP page, tool annotation or LLM answer cannot authorize it.
Top-document ownership is enforced: the draft's `Tool.source` or legacy polyfill's
`RegisteredTool.window` must identify the executing top page. Same-origin iframe
tools are deliberately not exposed by this adapter.

- Security contracts: 21/21 local Node checks passing including cancellation,
  schema refusal, navigation identity, and same-origin iframe exclusion.
- Official `@w3c/webmcp-polyfill@0.1.1` on Chromium via Playwright:
  4/4 hosted browser tests passed in Actions run #44986330857 (2026-11-22).
- An isolated Manifest V3 test extension and an additional real-polyfill iframe
  test are under separate CI qualification; do not assume their result.
- An exact SHA-pinned real TeaVM Gradle JSO/JavaScript codegen job is now included
  in the CI workflow, but its completion is a separate acceptance gate.
- Native browser WebMCP and complete WPT, browser-agent integration, HTTP
  Permissions Policy, mixed-origin/mixed-native frames and user confirmation
  remain unqualified. ChromeLLM continues to have no browser runtime.

Because full JSON Schema is not supported, the adapter rejects unfamiliar
keywords rather than ignoring them. No tool metadata can establish authority,
and cancellation cannot undo an operation that the page already performed.
