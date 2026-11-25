# ChromeAIAgent Java 21 additive core

Independent opt-in Java/JNI module. The Chrome extension remains unchanged. Consult `../docs/M3_JAVA_AGENT_PORT.md` before modifying contracts.

- Java-only verification: `sh scripts/verify.sh` (requires JDK 21, C++17 compiler for optional native branch).
- Java jar packaging: `mvn -f java-agent/pom.xml -B -ntp package` from repository root on an environment with Maven installed.
- A native JNI test is mandatory in CI on Linux. Without compiler/native headers, the script explicitly fails rather than claiming native qualification.
- `PlanOrder` does not execute tool actions. `PlanExecutor` only executes operations registered by the host caller. No command execution tool is provided.
- The native library is built under `java-agent/target/native` and never copied into the extension or installed system-wide.

This module is a qualification slice and does not replace or extract Chrome's built-in model.

## Ranking contract regression

The category search suite runs an independent full-scan/full-sort oracle against
Java and JNI query paths, including every result limit from 1 through 100,
source/category filters, prefix terms, shuffled inputs, and ties at the 4096-record
capacity. Ranking retains only the requested number of IDs and scores in primitive
arrays while preserving the existing result order.

The new `ProblemSearchRankingContractTest.java` is independently authored under
Apache-2.0; see `LICENSE-APACHE-2.0.txt`. Existing source and upstream notices retain
their original licenses.
