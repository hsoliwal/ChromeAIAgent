# Native WebMCP qualification — ChromeAIAgent / TeaVM

Status: **review-only draft**. This workflow is a test harness, not a production
feature activation, not a backend MCP transport and not a browser-owned AI model.

## Exact inputs
- TeaVM candidate commit: `7eaf021d7958a372fbb4250d899485ab7b89b492` (PR #6).
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
The successful **observed** hosted gate was run #45096035244 (details below).
Changing browser flags or versions requires a reviewed source/version pin.

## Merge boundary
This workflow is separate from the merged, default-deny ChromeAIAgent
adapter. Do not enable the extension UI, alter ChromeLLM browser independence
or merge the TeaVM API based on polyfill-only qualification. The TeaVM
branch remains draft until its history/source and native compatibility gates
have been reviewed and recorded.

## Exact hosted qualification (2026-11-23)

**PASS** — [GitHub Actions run #45096035244](https://github.com/hsoliwal/ChromeAIAgent/actions/runs/45096035244)
used compiled TeaVM Java from pinned commit `7eaf021d7958a372fbb4250d899485ab7b89b492` with Chromium
**156.0.8078.4**, Playwright **1.64.0** and the official W3C polyfill **0.1.1**.
JSO Java/Checkstyle, compiler artifact publishing, compiled-JavaScript
generation and WAR packaging were successful. Both the official-polyfill
control and the native Chromium test reported **1 passed, 0 failed**.
The native test required an existing browser-native `document.modelContext`,
then verified the compiled Java tool, preservation after loading the
polyfill, and Playwright `page.webmcp.tools()` / `callTool()`.

The earlier native run #45095461678 failed its final resource-console
assertion on a 404 consistent with headed Chromium's unserved favicon.
The corrected test serves `/favicon.ico` with HTTP 204 while retaining
strict failure behavior for all other resource errors. This documentation
update changes no program code or workflow source.

**HOLD before production:** full-history root/ref/PR audit, native
cross-origin Permissions Policy, broader WPT and browser-version coverage,
explicit operator confirmation UX, and actual cloud-agent permission are
not demonstrated. The native browser flag and CI harness are experimental.
Neither this PR nor the earlier ChromeAIAgent adapter adds an automatic
backend MCP transport or browser dependency to ChromeLLM.
