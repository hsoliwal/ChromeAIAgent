# Native WebMCP qualification — ChromeAIAgent / TeaVM

Status: **review-only draft**. This workflow is a test harness, not a production
feature activation, not a backend MCP transport and not a browser-owned AI model.

## Exact inputs
- TeaVM candidate commit: `3afe65274a093054fc0b112adfabb6136017e9df` (PR #6).
- Node.js 24; Java 21; Ubuntu 24.04; Playwright 1.64.0 (native WebMCP harness).
- Official compatibility control: `@w3c/webmcp-polyfill@0.1.1`.
- Browser: Playwright-managed Chromium with feature flags; exact version printed by test.
- The actual compiled TeaVM Java WebMCP sample and generated WAR are the test source.

## Gates
The control test verifies the official polyfill in a real browser, with native
WebMCP disabled. The independent native test runs headed under Xvfb and fails
unless `document.modelContext` is truly exposed before loading any polyfill.
It verifies Java-owned registration/discovery/execution, an unchanged native
context after optional polyfill installation, and Playwright 1.64
`page.webmcp.tools()` / `page.webmcp.callTool()` behavior.

The test does not use a cloud agent, share credentials, install the normal
ChromeAIAgent extension, or exercise cross-origin permissions delegation.
It must not be counted as a native pass until a real hosted run completes.
Changing browser flags or versions requires a reviewed source/version pin.

## Merge boundary
This workflow is separate from the merged, default-deny ChromeAIAgent
adapter. Do not enable the extension UI, alter ChromeLLM browser independence
or merge the TeaVM API based on polyfill-only qualification. The TeaVM
branch remains draft until its history/source and native compatibility gates
have been reviewed and recorded.
