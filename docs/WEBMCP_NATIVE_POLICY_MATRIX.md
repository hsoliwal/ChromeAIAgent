# Native WebMCP Permissions Policy and lifecycle security matrix

**TEST ONLY**: the normal ChromeAIAgent extension and manifest are unchanged.
Run headed Chromium with experimental native WebMCP features under Xvfb,
Node 24 and pinned Playwright 1.64.0. Use two loopback **distinct origins**,
with no polyfill installed or native API fallback.

The tests verify that Permissions Policy blocks registration in an
undelegated cross-origin iframe. They verify that discovery requires
`exposedTo` and `fromOrigins` for the delegated iframe's tool and that the
exposed tool executes successfully. They also check registration revocation,
caller rejection and the owner callback's abort event on cancellation, and
owner cancellation when Playwright navigates the delegated caller iframe.
The navigation uses a different document at the caller's existing origin.
The two loopback origins differ by port and are on the same site.

These assertions are native experimental API security probes; their value
is only a real finished hosted CI result, not source or stub assertions.
They are not a WPT certification, cloud-agent authorization or production
permissions UI, and introduce no browser dependency into ChromeLLM.
Do not merge while failing tests or without source/history/rights review.

## Cancellation delivery sequencing (2026-11-23)

Hosted native Chromium 156.0.8078.4 / Playwright 1.64.0
[run #45110400921](https://github.com/hsoliwal/ChromeAIAgent/actions/runs/45110400921)
reported **4/5 tests passed**. The failing case received `AbortError`
in the calling realm and observed `ownerAborted: false` after one event-loop
turn. The log does not establish whether the owner's abort event arrived
later. Asynchronous delivery is a timing-race hypothesis to be tested,
not a passing outcome.

The revised test keeps both requirements: reject the caller with
`AbortError` and deliver an abort to the owning callback. It now waits
for the callback's actual signal event with a strict 2-second bound
rather than sampling the flag after a single event-loop turn.
**Timeout or missing propagation still fails.** Waiting for the observable
owner event preserves both cancellation requirements.

No production adapter or extension manifest is changed; the updated
case requires an independently completed hosted CI rerun before
it can be marked passed.

The follow-up keeps the two-second owner-delivery bound, independently
checks the owner's aborted signal and `AbortError` reason, and clears
timeout handles after each observation. The caller and owner outcomes
must both arrive; a missing outcome still fails the test. The discovery
case checks the pinned native descriptor's `window` field and does not
claim to exercise execution of a hidden private tool.
