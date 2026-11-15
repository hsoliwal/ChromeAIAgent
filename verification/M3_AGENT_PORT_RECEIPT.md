# ChromeAIAgent M3 Java/JNI proposal — local verification receipt

- Fork / base: `hsoliwal/ChromeAIAgent` `master` @ `b590a51891e6bd30bc9b1804914578854147fbb4`
- Source tree inventory: 59 original blobs; no existing files changed; 13 additive source/doc/build/CI files prior to this receipt.
- Donor: `guberm/ChromeAIAgent` (MIT), behavior/concepts referenced but no donor source copied.
- Toolchain: OpenJDK 21.0.12.1, C++17 g++, `-Xlint:all -Werror`, `-Wall -Wextra -Werror`, JNI `-Xcheck:jni`.
- Ordered result: shell-syntax PASS → Java lint+compile PASS → native compile/link PASS → AgentCoreContractTest **32** checks PASS → KeywordParityContractTest **344** checks PASS → jar creation PASS → `jdeps` only `java.base` PASS.
- Source idempotence: source hashes compared across two ordered verify passes, byte-identical PASS.
- No Maven executable available in local runtime; `mvn package` is **NOT TESTED locally** and remains a GitHub CI gate.
- No Chrome browser or licensed real model was invoked; ChromeLLM PR #54 integration is **NOT TESTED**, and no native LLM inference is claimed.
- No actual browser extension, Windows, macOS, Maven plugin, model download, or GPU throughput test was run.
- Before publishing: compare proposed files to repository HEAD, open a nonmerging draft PR. No main-branch mutation.

## Exact staged file SHA-256

| File | SHA-256 |
| --- | --- |
| `.github/workflows/java-agent-contract.yml` | `1c495aed7031144457e354649b45081a8e8da8b20991a83144fd98bfd97e24a5` |
| `docs/M3_JAVA_AGENT_PORT.md` | `3ca34b20b65ea7ffc71434deca8f87de993f2186fbe29b28a0080cce96534045` |
| `java-agent/README.md` | `86603fbaf076aeaf74aac1ee826382faaf73ad1d22b6a78dbbaf1f69215667cd` |
| `java-agent/native/keyword_matcher_jni.cpp` | `617a431d9646d02f200512c75450ce52d6e48931bdee78924a4641f96db861ba` |
| `java-agent/pom.xml` | `ecc6a177f76bc5b69ca653d750a6c59ada684bee55bccdc46b90ee423eb7131c` |
| `java-agent/scripts/verify.sh` | `f23ba9a0694a318a00ea72131d5875714662447765a49789c8d3ddac41decb40` |
| `java-agent/src/main/java/io/synexia/chromeagent/AgentStep.java` | `6652262b710c713ac1ba1aad2d538781a2f7ae087533821411dbb78bdd1ba6c7` |
| `java-agent/src/main/java/io/synexia/chromeagent/AsciiKeywordMatcher.java` | `2a37cad66f03cf98b8794c908f0a1deb81a8e99b0b8fc8389f6877cb73b591e0` |
| `java-agent/src/main/java/io/synexia/chromeagent/NativeKeywordMatcher.java` | `60d043dc6509155c7e2e9398f392f207560e800127b08e4467c20d787b6a503e` |
| `java-agent/src/main/java/io/synexia/chromeagent/PlanExecutor.java` | `38805f3ffb1cb364ef8f4448c27bdda267470d5a0d92f528f180ad90a0dea391` |
| `java-agent/src/main/java/io/synexia/chromeagent/PlanOrder.java` | `9a0cfef95ec142410d06bdfea4c6dc4e72221b87e97bf710aac25cae23001316` |
| `java-agent/src/test/java/io/synexia/chromeagent/AgentCoreContractTest.java` | `a89148be2b3f34faa61674a91810bd153cab1be9f7ffdb014747e9ecf28f2a4d` |
| `java-agent/src/test/java/io/synexia/chromeagent/KeywordParityContractTest.java` | `148770a1a5ec1b561cf58696c63a643b379d343f5d4bf0a1a73181f296c00b91` |
