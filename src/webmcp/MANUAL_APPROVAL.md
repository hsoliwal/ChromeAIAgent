# Manual WebMCP one-shot approval console (draft, not wired)

**Important:** This is an independently accessible extension-owned HTML page,
not a production feature. The existing side panel, background service worker,
manifest, automatic tool discovery and ChromeLLM are unchanged.

## Operator flow
Open `src/webmcp/manual-console.html` as a packaged extension page in a
test/development installation. It never activates itself or injects on page
load. Click **List browser tabs**, explicitly choose an HTTPS/loopback tab,
then click **Discover**; discovery consumes a one-time extension approval.
Select an untrusted tool, enter a JSON argument object, click **Review this
invocation**, examine the target and exact arguments, then click **Approve
and execute once**. The execution consumes an exact per-tab, per-origin,
per-document, per-tool, per-schema-and-input JSON grant that expires within
eight seconds. No grant is persisted or shared with a cloud agent.

Discover and execute remain separately authorized. The existing adapter
enforces exact origin and Chrome document ID, validates the supported JSON
Schema subset, limits bytes and execution time, and never auto-retries.
Untrusted page-supplied tool metadata and outputs are displayed with
`textContent` only; annotations are **hints**, never authorization.
Each execution may already have side effects by the time an error occurs.

## Qualification
`node --test tests/webmcp-manual-grant.test.js` validates default deny,
one-shot consumption, scope matching, expiration, input identity and revocation.
The existing WebMCP adapter's tests assert the additive `documentId` field
in authorization callbacks. A real extension UI usability/browser smoke and
production consent policy review remain separate gates.

**Do not link this console into the normal extension UI or merge without
reviewing actual permissions, user gestures, native/polyfill version matrix
and source/history audit.** No ChromeLLM browser runtime or MCP transport is
introduced. MIT license applies.


## Race-free reviewed intent (2026-11-23)

Manual review now records an incrementing `reviewEpoch`, the exact raw input
as displayed, and the selected tool index. Input and selection changes
invalidate that review. During the asynchronous `chrome.tabs.get()` check,
the UI disables input editing; immediately afterward, before `armExecute`,
the extension rechecks the review epoch, raw input and tool selection.
If anything changed, it raises `review_invalidated`, **without arming** an
execution grant. The browser-side document ID remains pinned by the adapter.

`tests/webmcp-manual-review-race.test.js` uses a deterministic in-memory
DOM plus a deliberately deferred `chrome.tabs.get` to verify both cases:
programmatic review invalidation before the awaited check settles must not
execute, while unchanged explicit intent still authorizes exactly once.
The existing real MV3 test checks that merely reviewing does not execute,
that invalid arguments are refused, and that document navigation invalidates
a reviewed call. These separate tests must pass CI before promotion.

**Boundary:** disabling the input prevents ordinary editing, but is not
a replacement for the review-epoch check or browser document-ID matching.
Browser callbacks may have irreversible effects once invoked; a timeout
never authorizes an automatic retry. The console remains dormant and is
not imported into the shipping extension's normal background/UI paths.
