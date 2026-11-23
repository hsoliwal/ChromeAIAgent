#!/bin/sh
# Additive, isolated JNI problem-reference search qualification.
set -eu
cd "$(dirname "$0")/.."
JAVAC=$(command -v javac)
JAVA_HOME_DETECTED=$(dirname "$(dirname "$(readlink -f "$JAVAC")")")
[ "$(java -version 2>&1 | sed -n '1s/.*version "\([0-9][0-9]*\).*/\1/p')" = 21 ] || { echo 'JDK 21 required'; exit 1; }
sh -n scripts/verify-problem-search.sh
mkdir -p target/classes target/test-classes target/native
find src/main/java -name '*.java' -print | LC_ALL=C sort > target/problem-sources-main.txt
javac -encoding UTF-8 -Xlint:all -Werror -d target/classes @target/problem-sources-main.txt
find src/test/java -name '*.java' -print | LC_ALL=C sort > target/problem-sources-test.txt
javac -encoding UTF-8 -Xlint:all -Werror -cp target/classes -d target/test-classes @target/problem-sources-test.txt
g++ -std=c++17 -O2 -fPIC -Wall -Wextra -Werror \
    -I"$JAVA_HOME_DETECTED/include" -I"$JAVA_HOME_DETECTED/include/linux" \
    -shared native/posting_intersection_jni.cpp -o target/native/libchromeaiagent_postings.so
java -ea -cp target/classes:target/test-classes io.synexia.chromeagent.ProblemSearchContractTest
java -ea -Xcheck:jni -cp target/classes:target/test-classes \
    io.synexia.chromeagent.PostingParityContractTest "$(pwd)/target/native/libchromeaiagent_postings.so"
find src/main src/test native scripts -type f -print | LC_ALL=C sort | xargs sha256sum > target/problem-source-sha256.txt
printf '%s\n' 'VERIFICATION_PASS=problem-search-java21+jni'
