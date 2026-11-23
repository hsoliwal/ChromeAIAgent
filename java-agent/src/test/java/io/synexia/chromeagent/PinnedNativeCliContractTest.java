package io.synexia.chromeagent;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.HexFormat;

/** Exact-byte Java/native CLI parity and refusal checks; no native fallback. */
public final class PinnedNativeCliContractTest {
    private static int checks;
    private PinnedNativeCliContractTest() { }

    private static void check(boolean condition, String purpose) {
        if (!condition) throw new AssertionError(purpose);
        checks++;
    }

    private static String run(String... args) throws IOException {
        ByteArrayOutputStream data = new ByteArrayOutputStream();
        try (PrintStream output = new PrintStream(data, true, StandardCharsets.UTF_8)) {
            ProblemSearchMain.run(args, output);
        }
        return data.toString(StandardCharsets.UTF_8);
    }

    private static void refuse(String... args) throws IOException {
        try { run(args); }
        catch (IllegalArgumentException | IOException expected) { checks++; return; }
        throw new AssertionError("unapproved JNI CLI request was accepted");
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("native library path required");
        Path library = Path.of(args[0]);
        String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(Files.readAllBytes(library)));
        String path = "--jni-lib=" + library;
        String digest = "--jni-sha256=" + sha;
        String javaRows = run("--source=hackerrank", "--category=search", "prefix", "trie");
        String javaBrowse = run("--category=graph");
        check(javaRows.contains("contacts"), "nonempty reference baseline");
        check(javaRows.equals(run("--source=hackerrank", "--category=search", "prefix", "trie")),
                "legacy mode repeatability");
        refuse(path, "prefix");
        refuse(digest, "prefix");
        refuse(path, path, digest, "prefix");
        refuse(path, digest, digest, "prefix");
        refuse(path, "--jni-sha256=", "prefix");
        refuse(path, "--jni-sha256=" + sha.toUpperCase(java.util.Locale.ROOT), "prefix");
        refuse(path, "--jni-sha256=" + sha.substring(1), "prefix");
        refuse(path, "--jni-sha256=" + "0".repeat(64), "prefix");
        refuse("prefix", path, digest);
        refuse("--jni-lib=relative.so", digest, "prefix");
        refuse("--jni-lib=" + library.resolveSibling("absent-file.so"), digest, "prefix");
        refuse("--jni-lib=" + library.getParent(), digest, "prefix");
        Path link = library.resolveSibling("posting-library-link-for-test.so");
        try {
            Files.deleteIfExists(link);
            Files.createSymbolicLink(link, library);
            refuse("--jni-lib=" + link, digest, "prefix");
        } finally {
            Files.deleteIfExists(link);
        }
        Path tampered = library.resolveSibling("posting-library-tampered-for-test.so");
        try {
            Files.copy(library, tampered, StandardCopyOption.REPLACE_EXISTING);
            Files.write(tampered, new byte[] {1}, StandardOpenOption.APPEND);
            refuse("--jni-lib=" + tampered, digest, "prefix");
        } finally {
            Files.deleteIfExists(tampered);
        }
        Path empty = library.resolveSibling("posting-library-empty-for-test.so");
        try {
            Files.write(empty, new byte[0]);
            refuse("--jni-lib=" + empty, digest, "prefix");
        } finally {
            Files.deleteIfExists(empty);
        }
        check(javaRows.equals(run(path, digest, "--source=hackerrank", "--category=search",
                "prefix", "trie")), "Java/JNI exact byte equivalence");
        check(javaBrowse.equals(run(path, digest, "--category=graph")),
                "filter-only JNI exact byte equivalence");
        check(run(path, digest, "--category=graph").equals(javaBrowse),
                "native query repeatability");
        System.out.println("PinnedNativeCliContractTest PASS checks=" + checks);
    }
}
