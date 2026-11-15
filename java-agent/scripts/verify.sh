#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
JAVAC=$(command -v javac)
JAVA_HOME_DETECTED=$(dirname "$(dirname "$(readlink -f "$JAVAC")")")
JAVA_MAJOR=$(java -version 2>&1 | sed -n '1s/.*version "\([0-9][0-9]*\).*/\1/p')
[ "$JAVA_MAJOR" = 21 ] || { echo 'JDK 21 required'; exit 1; }
sh -n scripts/verify.sh
mkdir -p target/classes target/test-classes target/native
# Stage 1: compiler lint and Java compilation; warnings fail the build.
find src/main/java -name '*.java' -print | LC_ALL=C sort > target/sources-main.txt
javac -encoding UTF-8 -Xlint:all -Werror -d target/classes @target/sources-main.txt
find src/test/java -name '*.java' -print | LC_ALL=C sort > target/sources-test.txt
javac -encoding UTF-8 -Xlint:all -Werror -cp target/classes -d target/test-classes @target/sources-test.txt
# Stage 2: native JNI compiler + linker. No system directories are written.
g++ -std=c++17 -O2 -fPIC -Wall -Wextra -Werror \
    -I"$JAVA_HOME_DETECTED/include" -I"$JAVA_HOME_DETECTED/include/linux" \
    -shared native/keyword_matcher_jni.cpp -o target/native/libchromeaiagent_keywords.so
# Stage 3: tests after both compilers succeeded.
java -ea -cp target/classes:target/test-classes io.synexia.chromeagent.AgentCoreContractTest
java -ea -Xcheck:jni -cp target/classes:target/test-classes \
    io.synexia.chromeagent.KeywordParityContractTest "$(pwd)/target/native/libchromeaiagent_keywords.so"
# Stage 4: reproducible code artifact hash (excludes generated files).
find src/main src/test native scripts -type f -print | LC_ALL=C sort | xargs sha256sum > target/source-sha256.txt
printf '%s\n' 'VERIFICATION_PASS=java21+jni-contract'
