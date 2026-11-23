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
eight seconds of the approval click, including time spent checking the tab.
No grant is persisted or shared with a cloud agent. The input is disabled
while the call is pending; any input event still revokes pending approval.

Discover and execute remain separately authorized. The existing adapter
enforces exact origin and Chrome document ID, validates the supported JSON
Schema subset, limits bytes and execution time, and never auto-retries.
Untrusted page-supplied tool metadata and outputs are displayed with
`textContent` only; annotations are **hints**, never authorization.
Each execution may already have side effects by the time an error occurs.

The adapter's optional `deadlineEpochMs` carries the original approval
deadline as `performance.timeOrigin + performance.now() + permission.ttlMs`,
calculated at the approval click. Its own execution budget can shorten that
deadline and cannot extend it. Tab/authorization checks, delayed injection
and page rediscovery retain the same deadline; rediscovery and tool execution
share the page budget. The injection request has a separate bounded response
wait and never grants a fresh execution budget. This is not a deadline for
the UI to finish: the console's initial tab lookup and the adapter's final
tab verification can take longer. Reaching a timeout does not roll back a
callback already started.

The grant class keeps its existing configurable 1–15,000 ms TTL; this console
uses its 8,000 ms default. Invalid replacements revoke the previous grant
even when the replacement is null or reading its fields throws. Metadata
is limited to 16 KiB of UTF-8, and arguments to 64 KiB of UTF-8. The review
displays bidirectional formatting controls as JSON escapes, preserving the
value and exact serialized arguments sent to the adapter.

The extension authorizes the bytes it submits. Page MAIN-world JavaScript
is untrusted and can replace its APIs or disregard cancellation; this is
not a sandbox for hostile page callbacks. The metadata signature detects
metadata changes but does not establish a stable registration identity
if a page re-registers the same name with identical metadata. Every new
invocation still needs fresh review and approval.

## Qualification
`node --test tests/webmcp-manual-grant.test.js` validates default deny,
one-shot consumption, scope matching, expiration, input identity and revocation.
`tests/webmcp-manual-console.test.js` runs the real console, grant, schema and
adapter in separate VM contexts with external DOM/Chrome test doubles. It
checks slow tab lookup, argument-edit revocation, success and readable JSON.
`tests/webmcp-deadline.test.js` executes the real injected page function in
a separate realm and checks delayed discovery/injection, consent expiry,
invalid deadlines and multibyte metadata bounds.
The existing WebMCP adapter's tests assert the additive `documentId` field
in authorization callbacks. `tests/webmcp-manual-ui-browser.test.mjs` is the
isolated real MV3 scenario; its successful execution, actual UI usability
and production consent policy review remain separate gates. VM tests do
not qualify actual Chrome extension permissions or document targeting.

**Do not link this console into the normal extension UI or merge without
reviewing actual permissions, user gestures, native/polyfill version matrix
and source/history audit.** No ChromeLLM browser runtime or MCP transport is
introduced. MIT license applies.


## Race-free reviewed intent (2026-11-23)

Manual review now records an incrementing `reviewEpoch`, the exact raw input
as displayed, and the selected tool index. Input and selection changes
invalidate that review. During the asynchronous `chrome.tabs.get()` check,
the UI disables input editing; immediately afterward, before dispatch,
the extension rechecks the review epoch, raw input and tool selection.
The grant was armed at the original click, so time spent checking the tab
counts toward expiry. If anything changed, `review_invalidated` revokes
that grant and prevents dispatch. The browser document ID remains pinned.

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
