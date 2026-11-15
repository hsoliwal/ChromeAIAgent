# M3 Java/JNI agent port — additive contract (proposal 1)

Status: review-only additive slice. Donor baseline: `guberm/ChromeAIAgent`, fork `hsoliwal/ChromeAIAgent`, master `b590a51891e6bd30bc9b1804914578854147fbb4`. No existing extension/manifest/API files change.

## Ownership and boundaries

- This repository owns **agent admission and deterministic action ordering** only. It does not own model weights, inference internals, Maven lifecycle mutation, source transformation, or arbitrary host process execution.
- `hsoliwal/ChromeLLM` owns Java/JNI inference and the optional installed-Chrome provider (draft PR #54); `hsoliwal/maven` owns Maven smart-build plans and verified artifact provisioning (draft PR #38). Integration may occur later through explicit, versioned adapters with contract tests.
- Chrome's built-in model remains browser-managed. Do not extract, download, or redistribute Chrome-managed model assets. No assumption that `guberm/ChromeAIAgent` supplies such assets.
- The original extension's user interface, `chrome.*` permissions, `Intent`, `AgentPlanStore`, and browser automation behavior remain unchanged.
- Java defaults to an ASCII, browser-free lexical helper. Optional native JNI acceleration uses **the same bounded exact-match contract**, not a different intent model or implicit fallback. It is experimental, not a performance claim.

## Stable proposed Java semantics (v1)

`AgentStep(id, operation, dependencies, parameters)` is immutable. IDs and operation keys are lowercase ASCII identifiers, length <=64; parameter keys use the same grammar and their values are bounded. No implicit browser operations are executed by constructing a step.

`PlanOrder.order(...)` validates **all** steps before producing a schedule: unique IDs; known dependencies; no self-dependencies or duplicate edges; DAG only; bounded step/edge counts. Kahn topological sorting with a lexicographic priority queue provides deterministic tie-breaking regardless of input order. Complexity O(V+E+V log V), assuming bounded identifier length; storage O(V+E). This is scheduling order, not authorization to execute.

`PlanExecutor.run(...)` first validates the entire plan and rejects unknown/unregistered operations **before any tool callback**. A tool is explicitly registered by the caller; no shell, network, browser, filesystem, or model provider is registered by default. It executes serially and stops on failure. Each successful output has a SHA-256 digest; results are immutable. No replay cache or cross-run exactly-once promise exists.

`AsciiKeywordMatcher` accepts printable ASCII plus TAB/LF/CR text and lowercase ASCII phrases. Matching is ASCII case-insensitive and enforces ASCII word boundaries `[A-Za-z0-9_]`. Candidates are checked in supplied priority order; within a candidate, the leftmost exact bounded occurrence wins. Strings above declared sizes, inputs whose `text length × candidate count` exceeds 8,388,608, or Unicode input are refused, not silently coerced. Complexity is bounded O(candidate count × text length × maximum phrase length), and no speedup is claimed before benchmarking. Java is the default. `NativeKeywordMatcher` must be enabled with an explicit library path and must reject unavailable JNI rather than silently switching provider.

## Algorithm donor catalogue and acceptance

| Category | Problem references | Alternatives | Selected v1 | Reason | Required gate |
| --- | --- | --- | --- | --- | --- |
| dependency-order | LeetCode 210 Course Schedule II; GeeksforGeeks Kahn's Algorithm | recursive DFS; Kahn FIFO; Kahn min-heap | Kahn min-heap | cycle detection, bounded stack, stable total ordering | unknown/duplicate/cycle rejection, permutations and edge limits |
| lexical-match | GitHub `guberm/ChromeAIAgent/src/bg/intent.js`; naive scan vs KMP vs Aho-Corasick | linear scan; KMP; trie/AC | candidate-priority bounded scan | few small keywords; simple equivalence proof; JNI costs can dominate | exact Java/JNI parity, punctuation and refusal vectors |
| streaming-metrics | HackerRank Find the Running Median | sort on each event; two heaps | **deferred** | no streaming median needed for this port | benchmark and metric contract before implementation |
| local-inference | `hsoliwal/ChromeLLM` provider APIs | bespoke JNI vs reuse existing SPI | **reuse existing SPI** (deferred adapter) | avoids a second inference runtime | live model/ABI/provider contract proof |

Problem references describe algorithmic constraints, not permissively licensed source. This implementation is independently written; no LeetCode/HackerRank/GeeksforGeeks user submission code is copied. Original ChromeAIAgent MIT license remains in the fork.

## Verification gates

1. Patch new files only and record source SHA-256.
2. Diff whitespace and static shell checks (if available).
3. Java 21 `javac -Xlint:all -Werror` compile; native C++17 build with JNI headers and warnings-as-errors.
4. Java regression and Java/native parity tests using the **real** JNI library.
5. Runtime smoke of serial callback execution and failure refusal.
6. GitHub PR comparison and CI verification. Local javac/native results are not Maven package success; CI Maven build is separately required.

No model inference, CPU/GPU performance uplift, Chrome availability, packaging to Maven Central, or extension browser regression is claimed without further evidence. Any future product change requires its own discrete recipe, diff and acceptance gate.
