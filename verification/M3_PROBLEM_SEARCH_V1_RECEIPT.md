# M3 problem-reference index qualification receipt

Recorded 2026-11-23. All new product changes are additive; no upstream Chrome extension source, default manifest, existing Java/JNI contract, or Maven Core file was changed.

## Fixed scope

Source fork: `hsoliwal/ChromeAIAgent`, additive to merged Java agent PR #1. Java model/backend ownership stays with merged `hsoliwal/ChromeLLM` PR #54; Maven plan/build ownership stays with merged `hsoliwal/maven` PR #38. The new catalogue contains eight manually curated, publicly accessible problem-reference links. No remote scraped metadata, problem statement or user solution was copied. New Java and C++ implementations are original code using standard algorithms.

## Local execution (not hosted CI)

Environment: OpenJDK `21.0.12.1`, `/usr/bin/g++` C++17 compiler, Linux x86_64. Existing `java-agent/scripts/verify.sh` and additional `java-agent/scripts/verify-problem-search.sh` were executed in this order after source authoring and shell validation. `javac -Xlint:all -Werror`; native `-Wall -Wextra -Werror`; `java -ea -Xcheck:jni`. Both scripts returned zero exit status.

- Existing AgentCoreContractTest: **32 checks passed**.
- Existing KeywordParityContractTest (actual JNI): **344 checks passed**.
- New ProblemSearchContractTest (metadata validation, source/category/prefix/AND query, deterministic canonicalization, ranking, refusals, immutability): **132 checks passed**.
- New PostingParityContractTest (actual JNI, exhaustive 7-bit subset pairing, max-size postings, refusal checks, index-backend equivalence): **16,420 checks passed**.
- Total observed **16,928 checks** across the four suites.
- Local `jar --create` succeeded; `jdeps --print-module-deps` reported **`java.base`** only.
- Source list and SHA-256 ledger: `java-agent/target/problem-source-sha256.txt` is locally generated and intentionally excluded from the PR.

## Boundaries and unqualified gates

No Maven executable is installed in the local verification container. No `mvn package`, hosted GitHub Actions, Windows/macOS JNI, Chrome browser, WebMCP live mediation, model download/inference, native throughput improvement, or production-scale corpus benchmark is claimed here. The new PR workflow runs existing and new tests plus real Maven packaging on GitHub-hosted Linux runners; those results must be inspected separately.

Two-pointer JNI is explicitly selected and requires a separately approved absolute native library; there is no automatic fallback, native search authority, model-driven execution, network fetch, or file mutation. Ranking is deterministic relevance scoring, not a learned ranking model.
