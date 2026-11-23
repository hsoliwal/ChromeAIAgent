# M3 pinned JNI search CLI v1 — additive contract

Status: additive, opt-in enhancement stacked on `hsoliwal/ChromeAIAgent` PR #8 (`m3/problem-category-jni-search-20261123`). No existing extension, default provider, agent-plan, catalogue schema, search ranking, or Maven lifecycle change is authorized.

## Problem and owner

The exact current Java 21 `ProblemSearchIndex` already offers `Backend.JAVA|JNI`, and the optional native C++17 posting intersection has passed Java parity tests. The read-only `ProblemSearchMain` CLI cannot select the JNI backend. Provide an explicit native CLI route without introducing new search semantics, another algorithm-catalogue owner, or implicit dynamic-library execution. `com.synexia` owns the canonical cross-repository recipe/donor catalogue; this CLI remains a standalone, metadata-only consumer.

## Versioned CLI additions

The existing CLI defaults and output remain byte-identical when neither new option is present.

* `--jni-lib=/canonical/absolute/libchromeaiagent_postings.so` and `--jni-sha256=<64 lowercase hexadecimal>` are an **inseparable option pair**, before query terms. Each is accepted at most once; options after query text are refused.
* The library must be a pre-existing, non-symlink, regular file at its canonical absolute path. Uppercase/non-hex/incorrect digests, relative paths, absent files, symlinks, empty files, and files larger than 64 MiB are rejected. SHA-256 is checked on the exact file bytes before invoking the dynamic loader. The caller is responsible for separately approving origin, license, ABI, and OS architecture; a digest alone is **not** a trust assertion.
* When both options are accepted, call `NativePostingIntersection.loadVerified` once, then use the existing immutable index `Backend.JNI`. No automatic native discovery, silent Java fallback, network retrieval, model selection, tool execution, or native library build occurs in the CLI.
* The existing `NativePostingIntersection.load(Path)` contract remains unchanged; the new `loadVerified(Path,String)` is additive. JNI linkage and native C++ symbols remain unchanged.
* Both providers must return the exact same TSV bytes for the same valid input. No speedup claim is made from JNI use; for 4096-or-fewer records, a JVM-only query can be faster due to crossing overhead.
* File verification and later native loading are separate OS operations, so the caller must provide an immutable, access-controlled library directory. This check does not eliminate a privileged time-of-check/time-of-use replacement, or attest to the license/signature of the native bytes.

## Ordered gates

1. Inventory PR #8 exact head and per-file SHA-1 Git blob identities; full-read affected CLI, loader, test scripts and relevant contracts.
2. Document additive semantics before modifying any existing files. Record pre/post SHA-256 for every edited file.
3. Patch new `NativeLibraryAdmission`, `NativePostingIntersection.loadVerified`, CLI option parser, and one dedicated contract test. Existing JNI implementation, old CLI calls, Maven POM, browser extension files, and default agent interfaces remain unchanged.
4. Shell syntax/lint, strict Java 21 `javac -Xlint:all -Werror`, native C++17 `-Wall -Wextra -Werror`, then Java negative/positive cases and actual `-Xcheck:jni` JNI execution. Run original legacy suites before the new suite.
5. Verify default CLI golden bytes, valid digest/native parity, malformed digest, missing peer option, symlink/path rejections, tampering and replay. Repeat verification and compare source SHA-256 and deterministic test transcripts.
6. Publish as **stacked draft** targeting the exact PR #8 feature branch. Hosted Maven, Windows/macOS and ABI-specific native execution remain HOLD until actual runs complete.

## Usage (after verification script and operator approval)

```sh
LIB=/approved/immutable/libchromeaiagent_postings.so
DIGEST=$(sha256sum "$LIB" | cut -d' ' -f1)
java -ea -Xcheck:jni -cp java-agent/target/classes \
  io.synexia.chromeagent.ProblemSearchMain \
  --jni-lib="$LIB" --jni-sha256="$DIGEST" \
  --source=hackerrank --category=search prefix
```

This example does not download, build, sign, or license the library. The CLI continues to support its existing metadata-only built-in seeds or an explicitly supplied TSV file.
