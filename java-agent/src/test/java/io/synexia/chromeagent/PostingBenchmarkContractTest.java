package io.synexia.chromeagent;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

/** Bounded benchmark admission, fixture-result parity and output-shape oracle. */
public final class PostingBenchmarkContractTest {
    private static int checks;
    private PostingBenchmarkContractTest() { }

    private static void check(boolean condition, String purpose) {
        if (!condition) throw new AssertionError(purpose);
        checks++;
    }

    private static void refused(String... args) throws IOException {
        try { run(args); }
        catch (IllegalArgumentException | IOException expected) { checks++; return; }
        throw new AssertionError("benchmark admission accepted a forbidden input");
    }

    private static String run(String... args) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (PrintStream stream = new PrintStream(bytes, true, StandardCharsets.UTF_8)) {
            PostingBenchmarkMain.run(args, stream);
        }
        return bytes.toString(StandardCharsets.UTF_8);
    }

    private static Map<String, Long> verify(String output, boolean nativeMode, int samples, int iterations) {
        String[] lines = output.split("\n");
        check(lines.length == (nativeMode ? 19 : 10), "one row per shape/size/backend");
        check(lines[0].equals("scenario\tsize\tbackend\tmin_batch_ns_per_op\tmedian_batch_ns_per_op\tmax_batch_ns_per_op\tchecksum"),
                "stable TSV header");
        Map<String, Long> checksums = new HashMap<>();
        for (int i = 1; i < lines.length; i++) {
            String[] row = lines[i].split("\t", -1);
            check(row.length == 7, "one TSV row has seven columns");
            check(row[2].equals("java") || nativeMode && row[2].equals("jni"), "explicit backend");
            check(row[0].matches("disjoint|half|equal"), "known scenario");
            int size = Integer.parseInt(row[1]);
            check(size == 32 || size == 256 || size == 4096, "bounded fixture size");
            long min = Long.parseLong(row[3]);
            long mid = Long.parseLong(row[4]);
            long max = Long.parseLong(row[5]);
            check(min >= 0 && min <= mid && mid <= max, "timing order without performance SLA");
            long checksum = Long.parseLong(row[6]);
            int overlap = row[0].equals("equal") ? size : row[0].equals("half") ? size / 2 : 0;
            long expectedCall = overlap == 0 ? 0L : overlap + 2L * (size - overlap) + 2L * (size - 1);
            check(checksum == expectedCall * samples * iterations, "fixture checksum oracle");
            String key = row[0] + ":" + row[1] + ":" + row[2];
            check(checksums.putIfAbsent(key, checksum) == null, "unique fixture/backend key");
        }
        return checksums;
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("explicit compiled JNI library required");
        Path library = Path.of(args[0]);
        String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(Files.readAllBytes(library)));
        String libOption = "--jni-lib=" + library;
        String pinOption = "--jni-sha256=" + sha;
        String[] small = {"--warmup=1", "--samples=3", "--iterations=2"};
        var javaMap = verify(run(small), false, 3, 2);
        var nativeMap = verify(run("--warmup=1", "--samples=3", "--iterations=2", libOption, pinOption),
                true, 3, 2);
        check(javaMap.size() == 9, "java-only without JNI activation");
        check(nativeMap.size() == 18, "explicit Java and JNI rows");
        for (var entry : javaMap.entrySet()) {
            check(entry.getValue().equals(nativeMap.get(entry.getKey())), "Java checksum preserved");
            check(entry.getValue().equals(nativeMap.get(entry.getKey().replace(":java", ":jni"))),
                    "native checksum matches Java");
        }
        refused("--warmup=0");
        refused("--warmup=10001");
        refused("--samples=2");
        refused("--samples=32");
        refused("--iterations=0");
        refused("--iterations=10001");
        refused("--iterations=-1");
        refused("--iterations=abc");
        refused("--iterations=2147483647");
        refused("--iterations=2", "--iterations=2");
        refused("--warmup=1", "--warmup=1");
        refused("--samples=3", "--samples=3");
        refused("prefix");
        refused("--unknown=1");
        refused(libOption);
        refused(pinOption);
        refused(libOption, "--jni-sha256=" + "0".repeat(64));
        refused(libOption, "--jni-sha256=" + sha.toUpperCase(java.util.Locale.ROOT));
        refused(libOption, pinOption, "--samples=31", "--iterations=10000");
        refused("--warmup=10000", "--samples=31", "--iterations=10000");
        check(run(small).split("\n").length == 10, "repeatable Java report shape");
        System.out.println("PostingBenchmarkContractTest PASS checks=" + checks);
    }
}
