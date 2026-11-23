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
