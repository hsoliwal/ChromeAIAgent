# M3 posting intersection benchmark v1 — optional qualification

## Authority and boundaries

This additive **experimental** benchmark belongs to `hsoliwal/ChromeAIAgent` and compares its EXISTING Java and JNI posting intersections. It is not a new index, an algorithm donor, an implementation-selection policy, a Maven goal, a Chrome provider, or permission to change Java/JNI public APIs. The canonical LeetCode/HackerRank/GeeksforGeeks review owner is the already-merged `hsoliwal/com.synexia` problem catalogue; challenge pages are metadata references, not implementation licenses. No challenge code is copied.

Pinned base: `hsoliwal/ChromeAIAgent` `master` at `fbd95f41069aa510f8231426dd3e164e199f02dc`. PR #8 and PR #9 are merged; old native and Java methods remain unchanged. All six paths introduced in this slice must be absent in the base before publication.

## Contract

- `PostingBenchmarkMain` is an explicit, read-only Java 21 CLI with no network, no shell and no implicit native loading. It reports local timing observations only; it neither selects a runtime backend nor modifies any product behavior.
- Default is Java-only. `--jni-lib=/absolute/canonical/path` and `--jni-sha256=64_lower_hex` must be supplied together before all non-option arguments (none allowed). The JNI load uses the pre-existing `NativePostingIntersection.loadVerified` admission, including SHA-256 pinning. The digest is identity, **not** provenance, sandboxing, or a mitigation of privileged local TOCTOU replacement.
- Optional integer bounds: `--warmup=1..10000` (default 48), `--samples=3..31` (default 7), `--iterations=1..10000` (default 250). Duplicate/unknown keys, extra arguments, missing paired native options, out-of-range values and work budgets exceeding 150,000,000 inspected input elements are refused BEFORE loading JNI.
- Fixed, independently authored fixtures: disjoint, half-overlap and equal postings for 32, 256 and 4096 entries. Every list is strictly increasing/nonnegative/unique. Left/right arrays of each fixture are equal in length; match counts are 0, `size/2`, or `size`. Fixture values do not depend on query order, OS, clock, user data, random seeds or donor input.
- For every fixture, validate Java output against independently calculated exact IDs and cardinality; with JNI enabled, compare full Java/native arrays before timing and refuse any mismatch. Per-sample alternating Java/native order prevents a permanent runner-order bias, but does not remove jitter. Each timed call consumes result length and first/last IDs to resist trivial elimination; warm-up results are assigned to a volatile sink so Java warm-up cannot be trivially eliminated. This instrumentation adds no behavior to production methods.
- TSV output: `scenario\tsize\tbackend\tmin_batch_ns_per_op\tmedian_batch_ns_per_op\tmax_batch_ns_per_op\tchecksum`. Values are measured wall-clock `System.nanoTime` differences divided by iteration count. These are distributions of **batch averages**, not independent per-call percentiles. A smaller number is better, but no latency SLA or speedup is established by any one run.
- No automatic benchmark runs in production, no timing thresholds in CI, no source mutation, no implicit Java fallback, no downloaded native binaries. JNI validation, JVM JIT compilation, JNI call and array-allocation costs are included in the measurement of the existing public methods.

## Ordered qualification

1. Inventory current PRs, merged base tree and Git blob identities; preserve the preimages.
2. This document is committed first in the proposal workspace, before source changes.
3. Patch only new benchmark, contract-test, shell, workflow and receipt paths. `sh -n` / `javac -Xlint:all -Werror` / C++17 `-Wall -Wextra -Werror` / legacy Java and real JNI suites / new tests / real benchmark samples, in that order.
4. Compare source SHA-256 and Git blob identity, repeat runtime tests, verify default Java path and pinned JNI/refusal behavior; publish a draft PR with a compare/diff and CI status. No automatic merge.
5. Performance measurements are indicative **only of the observed host/JDK/CPU**. A wider decision needs calibrated JMH or equivalent, repeated OS/JDK/backend runs, per-shape sample distributions, concurrency/allocation analysis, and native ABI qualification. Until then retain the two-pointer implementation and Java default.

## Usage

```sh
sh java-agent/scripts/verify-posting-benchmark.sh
java -cp java-agent/target/classes io.synexia.chromeagent.PostingBenchmarkMain --samples=7 --iterations=250
java -Xcheck:jni -cp java-agent/target/classes io.synexia.chromeagent.PostingBenchmarkMain \
    --jni-lib=/approved/libchromeaiagent_postings.so --jni-sha256=<verified-lowercase-hex> \
    --samples=7 --iterations=250
```

This shell script recompiles the Java and JNI test fixtures inside the existing `java-agent/target/` directory. No root/home/system path is written by the script. The explicit native path shown is an operator-provided existing file, not generated, fetched or installed by the CLI.
