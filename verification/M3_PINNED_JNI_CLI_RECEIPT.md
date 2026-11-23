# Pinned JNI CLI qualification — 2026-11-23

## Identity and scope

Repository: `hsoliwal/ChromeAIAgent`.
Stacked base: PR #8, `m3/problem-category-jni-search-20261123`, commit `88b3c7fd632e12475e7e2c4ddc1d31ed71c8b45b`.
This slice modifies only the read-only Java CLI, the explicitly loaded Java native wrapper, and the additive search verification script; it adds one digest admission leaf, one dedicated parity/refusal test and two documentation/receipt files. No Chromium extension, existing JNI native library, default backend, manifest, model provider, algorithm catalogue schema, Maven Core, or production WebMCP file was modified.

The existing `hsoliwal/com.synexia` PR #17400 has merged the canonical cross-platform problem catalogue, and #17630 has merged the Java/JNI agent evaluation. This PR does not duplicate their source discovery, recipe or classification owners. Donors and complexity choices are documented in the existing `docs/M3_PROBLEM_SEARCH_V1.md`; this follow-up only exposes the already-selected JNI postings in an explicitly pinned CLI.

## Changed-file preimage and postimage SHA-256

| Path | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| `java-agent/src/main/java/io/synexia/chromeagent/NativePostingIntersection.java` | `5377b121eb064d0fb22656c9753efc816b6ef73aa24648e9caaf8076c7f89a1f` | `17c13bc2827d15ada144a453fc0b2056a183327f689613d887d844486741be9e` |
| `java-agent/src/main/java/io/synexia/chromeagent/ProblemSearchMain.java` | `fbbac6d89334da503df74ae2aa80f35c6adbc5600d53372d6d007e22414231a8` | `f9889f3d887ad038d5e8ae1e85ef62817658ff81d127b45b9469f1e288886db1` |
| `java-agent/scripts/verify-problem-search.sh` | `031039e97ede9cc2f5d294f9e1ad088cdf21c935929d96256306a6e396f74dc2` | `aa0343db3ec7a32ed257661790d7787b6db95d11b08333229d9873664e072e3a` |
| `docs/M3_PINNED_JNI_CLI_V1.md` | ABSENT | `22b4eb42b3f942fd583bdf97eaf17fb9cb408d246d94a334ca9e95c90cfa2c8c` |
| `java-agent/src/main/java/io/synexia/chromeagent/NativeLibraryAdmission.java` | ABSENT | `33adb27ca15be951486c99af99cf4ec40ce93a7a64a18a2000d04890a3b6ea1f` |
| `java-agent/src/test/java/io/synexia/chromeagent/PinnedNativeCliContractTest.java` | ABSENT | `bf6396da421b40261a299f6317df4ff7bc02d657e8dc1f5c827871725530aff3` |

The Git blob preimages for the three edited files were independently observed at the PR #8 source commit. Only documentation and the two new Java leaves were added otherwise. Hash identity is not an assertion of semantic equivalence; behavioral checks follow.

## Executed local verification

Host: Linux x86_64, OpenJDK 21 and g++ C++17. No Maven binary available in the local container.

Ordered gates completed: shell syntax; strict Java compiler lint with `-Xlint:all -Werror`; native C++17 compile/link with `-Wall -Wextra -Werror`; old Java contract suites; new Java/JNI suites with `-ea -Xcheck:jni`; standalone CLI runtime output comparison; JAR creation; `jdeps`; a second full verification run.

| Test command / suite | Pass checks |
| --- | ---: |
| `AgentCoreContractTest` | 32 |
| `KeywordParityContractTest` | 344 |
| `ProblemSearchContractTest` | 133 |
| `ProblemCatalogueTsvTest` | 17 |
| `ProblemSearchMainTest` | 18 |
| `PostingParityContractTest` | 16,420 |
| `PinnedNativeCliContractTest` | 20 |
| **Total, separate reported checks** | **16,984** |

`PinnedNativeCliContractTest` covers malformed pins, missing companion flags, duplicates, options after query, nonexistent/relative/directory/symlink files, byte-tampered and zero-byte files, repeated native mode and parity with Java. Baseline Java and new default CLI output match exactly. A separate real Java process invoking the native CLI with the exact library digest yielded byte-identical TSV output. Generated JAR module dependency reported by `jdeps`: `java.base` only.

Repeated verification logs and source SHA-256 ledger matched exactly:

- Legacy `target/qualification/legacy-agent.log`: `1edf434708109082a4fab0d875e81fa75a847ca8ec414b960f25bc52ddc89606`
- Search `target/qualification/pinned-cli.log`: `0158a53ec50666f0f8106100002bd1527ee9e41796595782f6e9b37bfea90075`
- Source ledger `target/problem-source-sha256.txt`: `5fe5a62d1f9fe8047a3d3a9b7a5acbc71f46e5068107332cc70715e4b0f3c6fb`
- Old/default Java and new JNI standalone CLI TSV outputs: all `b3a0a6542ac8c82463666d37d9e1fa77af2fc5f37a4ba73e579488b44fa13768`.

## HOLD / exclusions

Maven package/plugin verification, GitHub Actions on the new head, Windows/macOS JNI, malicious TOCTOU races by privileged local processes, external model inference, real Chrome/WebMCP and native throughput benchmarks are NOT_RUN. A SHA-256 pin is identity evidence, not native code provenance, licensing, signing or an OS sandbox. Existing source ownership and default compatibility remain frozen.

Publication requires an append-only stacked draft PR targeting PR #8's feature branch. Do not merge PR #8 or this stacked PR until the exact-head required CI evidence is available.
