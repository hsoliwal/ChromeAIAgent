#!/bin/sh
# Verify original agent, existing search/JNI contracts, then the additive benchmark contract.
set -eu
cd "$(dirname "$0")/.."
sh -n scripts/verify-posting-benchmark.sh
sh scripts/verify.sh
sh scripts/verify-problem-search.sh
javac -encoding UTF-8 -Xlint:all -Werror -cp target/classes \
  -d target/test-classes src/test/java/io/synexia/chromeagent/PostingBenchmarkContractTest.java
java -ea -Xcheck:jni -cp target/classes:target/test-classes \
  io.synexia.chromeagent.PostingBenchmarkContractTest "$(pwd)/target/native/libchromeaiagent_postings.so"
find src/main src/test native scripts -type f -print | LC_ALL=C sort | xargs sha256sum > target/benchmark-source-sha256.txt
printf '%s\n' 'VERIFICATION_PASS=posting-benchmark-java21+jni'
