# Native WebMCP Permissions Policy and lifecycle security matrix

**TEST ONLY**: the normal ChromeAIAgent extension and manifest are unchanged.
Run headed Chromium with experimental native WebMCP features under Xvfb,
Node 24 and pinned Playwright 1.64.0. Use two loopback **distinct origins**,
with no polyfill installed or native API fallback.

Tests refuse cross-origin iframe tool registration without Permissions Policy;
check delegated registration but default-hidden tools, explicit `exposedTo`
plus `fromOrigins` discovery and execution; verify registration lifetime
revocation; check caller rejection and owner signal on cancellation; and
verify caller-frame navigation aborts pending operations.

These assertions are native experimental API security probes; their value
is only a real finished hosted CI result, not source or stub assertions.
They are not a WPT certification, cloud-agent authorization or production
permissions UI, and introduce no browser dependency into ChromeLLM.
Do not merge while failing tests or without source/history/rights review.

## Cancellation delivery sequencing (2026-11-23)

Hosted native Chromium 156.0.8078.4 / Playwright 1.64.0
[run #45110400921](https://github.com/hsoliwal/ChromeAIAgent/actions/runs/45110400921)
reported **4/5 tests passed**. The failing case received `AbortError`
in the calling realm but read the owning callback's abort flag before
the browser had dispatched that separate abort event. The failure was
`ownerAborted: false`, not an unexpected successful invocation.

The revised test keeps both requirements: reject the caller with
`AbortError` and deliver an abort to the owning callback. It now waits
for the callback's actual signal event with a strict 2-second bound
rather than sampling the flag after a single event-loop turn.
**Timeout or missing propagation still fails.** This is a test timing
correction, not weakened permission or cancellation behavior.

No production adapter or extension manifest is changed; the updated
case requires an independently completed hosted CI rerun before
it can be marked passed.
