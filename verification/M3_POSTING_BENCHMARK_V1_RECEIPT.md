# Posting intersection benchmark v1 — executed qualification receipt

Date: 2026-11-24. Receiver: `hsoliwal/ChromeAIAgent`; baseline `master` commit `fbd95f41069aa510f8231426dd3e164e199f02dc`. All six proposed paths were absent in the inspected master tree. Existing production Java/JNI files and browser extension source unchanged. No source from LeetCode/HackerRank/GeeksforGeeks was copied.

## Ordered gates and fixed-point

- Shell script syntax: PASS (`sh -n` on new verification script).
- Strict Java 21 compilation: PASS (`javac -Xlint:all -Werror` via unchanged parent scripts, followed by new contract test compilation).
- Native JNI C++17 compile/link: PASS (`g++ -std=c++17 -O2 -fPIC -Wall -Wextra -Werror` via unchanged parent scripts).
- Original agent and Java/JNI: `AgentCoreContractTest` **32**, `KeywordParityContractTest` **344** — PASS.
- Existing category search/JNI: `ProblemSearchContractTest` **133**, `ProblemCatalogueTsvTest` **17**, `ProblemSearchMainTest` **18**, `PostingParityContractTest` **16,420**, `PinnedNativeCliContractTest` **20** — PASS.
- New benchmark admission/parity/TSV fixture: `PostingBenchmarkContractTest` **234** — PASS with real `-ea -Xcheck:jni`.
- Sum of printed checks: **17,218**; all reported suites have zero failures. This is not a claim of unique test methods or source coverage.
- Initial new-test run failed because its negative fixture assumed the wrong exception for digest mismatch; original `NativeLibraryAdmission` correctly throws `IOException`. Test fixture corrected to admit `IOException` as an expected rejection; no production code was modified. Complete second and third runs PASSED.
- Repeated full verification: byte-identical stdout log `b4194882e15f23cb2b5d733b49d7c74a511ea72a15a268b2a602c526b13de9f9`; exact source hash ledger `e87ec5b1cce445839deecfe47c04bc8e0f511f0c3a9d004e7f11f966e08c83b0`.
- Standalone JAR built with `jar --create`. `jdeps --print-module-deps` returned **`java.base`**. Java-only CLI produced nine fixture rows (plus header); explicit pinned native CLI produced 18 fixture rows (plus header), with full Java/native fixture-result and checksum equality.

## Preimage/postimage source SHA-256 (all new)

| Path | Preimage | Postimage SHA-256 |
|---|---|---|
| `docs/M3_POSTING_BENCHMARK_V1.md` | ABSENT | `0b1b44271288523e55a1bc42fd6f6cc6f4b8f62b29479e0535341ac6672253d3` |
| `java-agent/src/main/java/io/synexia/chromeagent/PostingBenchmarkMain.java` | ABSENT | `a34f54a04a7a2660d625f67d92de3720f9074aa83a73cf3a8824a15fab4adef9` |
| `java-agent/src/test/java/io/synexia/chromeagent/PostingBenchmarkContractTest.java` | ABSENT | `c2d535546379ed23bbcda43f8549db51867fe1d5656d7f5c84a82d391e0e3e0e` |
| `java-agent/scripts/verify-posting-benchmark.sh` | ABSENT | `febf4f7613d7aaf7be8873447e099b54dac932ae9be40d49517b7c7bc518ea76` |
| `.github/workflows/java-posting-benchmark-contract.yml` | ABSENT | `8f4147b90e6cbc0a724348fd79981124fabad372c12bbc01a7cf7a3cdcb13466` |
| `verification/M3_POSTING_BENCHMARK_V1_RECEIPT.md` | ABSENT | Self-identity recorded in external publication manifest, not embedded recursively |

## One real observed host benchmark (not a performance admission)

Host: Linux x86_64, OpenJDK 21.0.12.1, native C++17 compiled locally. Invocation: `java -ea -Xcheck:jni -cp java-agent/target/classes io.synexia.chromeagent.PostingBenchmarkMain --warmup=48 --samples=7 --iterations=250 --jni-lib=... --jni-sha256=<sha256-of-local-library>`. Every median below is median of seven **per-batch average** times, with each batch 250 calls; wall-clock jitter, JIT and temperature are not controlled.

| Fixture | Entries per side | Java median ns/op | JNI median ns/op |
|---|---:|---:|---:|
| disjoint | 32 | 505 | 537 |
| half-overlap | 32 | 409 | 383 |
| equal | 32 | 375 | 434 |
| disjoint | 256 | 2,503 | 841 |
| half-overlap | 256 | 800 | 885 |
| equal | 256 | 6,617 | 3,756 |
| disjoint | 4096 | 21,056 | 7,626 |
| half-overlap | 4096 | 10,136 | 7,822 |
| equal | 4096 | 11,029 | 8,895 |

Raw timing TSV hash: `1bcb49a2705541f1e8e3e491e1f2b9e6e910b3637408baef67f443bf855bf425`. The data shows mixed shapes and large jitter; no statistically justified speedup or change to default `Backend.JAVA` follows. No benchmark threshold is applied in CI. JMH-like calibration, allocation/GC measurements, other CPUs, Windows/macOS ABI, Maven build, and true native end-to-end production workload remain unqualified.

## External gates

At time of local qualification, hosted Actions on this newly proposed head are not yet run. Real Maven `package` is not locally available (`mvn` absent). No release, model-runtime, Chrome browser, shell tool, agent permissions or native binary publication is authorized by this receipt. Source hash and Git readback are identity checks, not proofs of semantic equivalence.
