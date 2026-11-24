package io.synexia.chromeagent;

import java.io.IOException;
import java.io.PrintStream;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/** Optional local-only benchmark of the existing Java and JNI postings APIs. */
public final class PostingBenchmarkMain {
    private static final int[] SIZES = {32, 256, 4096};
    private static final String[] SHAPES = {"disjoint", "half", "equal"};
    private static final long MAX_WORK = 150_000_000L;
    private static volatile long sink;

    private PostingBenchmarkMain() { }

    private record Options(int warmup, int samples, int iterations, Path library, String sha256) { }
    private record Fixture(String scenario, int size, int[] left, int[] right, int expected) { }
    private record Timing(long min, long median, long max, long checksum) { }

    public static void main(String[] args) throws IOException {
        run(args, System.out);
    }

    static void run(String[] args, PrintStream output) throws IOException {
        Objects.requireNonNull(output, "output");
        Options options = parse(args);
        boolean withNative = options.library() != null;
        if (withNative) NativePostingIntersection.loadVerified(options.library(), options.sha256());
        List<Fixture> fixtures = fixtures();
        StringBuilder report = new StringBuilder("scenario\tsize\tbackend\tmin_batch_ns_per_op\tmedian_batch_ns_per_op\tmax_batch_ns_per_op\tchecksum\n");
        for (Fixture fixture : fixtures) {
            int[] javaResult = PostingIntersection.intersect(fixture.left(), fixture.right());
            if (javaResult.length != fixture.expected()) throw new IllegalStateException("invalid Java fixture");
            if (withNative && !Arrays.equals(javaResult,
                    NativePostingIntersection.intersect(fixture.left(), fixture.right()))) {
                throw new IllegalStateException("JNI mismatched Java oracle");
            }
            // The deterministic array fixture is shared between both backends, never altered.
            for (int i = 0; i < options.warmup(); i++) {
                consume(PostingIntersection.intersect(fixture.left(), fixture.right()));
                if (withNative) consume(NativePostingIntersection.intersect(fixture.left(), fixture.right()));
            }
            long[] javaSample = new long[options.samples()];
            long[] nativeSample = withNative ? new long[options.samples()] : null;
            long javaChecksum = 0;
            long nativeChecksum = 0;
            for (int i = 0; i < options.samples(); i++) {
                // Alternate measurement order by sample to reduce systematic JIT/thermal bias.
                if (withNative && (i & 1) != 0) {
                    Sample n = sample(fixture, options.iterations(), true);
                    nativeSample[i] = n.nsPerOp();
                    nativeChecksum += n.checksum();
                }
                Sample j = sample(fixture, options.iterations(), false);
                javaSample[i] = j.nsPerOp();
                javaChecksum += j.checksum();
                if (withNative && (i & 1) == 0) {
                    Sample n = sample(fixture, options.iterations(), true);
                    nativeSample[i] = n.nsPerOp();
                    nativeChecksum += n.checksum();
                }
            }
            if (withNative && javaChecksum != nativeChecksum) {
                throw new IllegalStateException("JNI benchmark checksum mismatch");
            }
            append(report, fixture, "java", new Timing(min(javaSample), median(javaSample),
                    max(javaSample), javaChecksum));
            if (withNative) append(report, fixture, "jni", new Timing(min(nativeSample),
                    median(nativeSample), max(nativeSample), nativeChecksum));
        }
        output.print(report);
    }

    private record Sample(long nsPerOp, long checksum) { }

    private static Sample sample(Fixture fixture, int iterations, boolean nativeBackend) {
        long check = 0;
        long begin = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            int[] result = nativeBackend
                    ? NativePostingIntersection.intersect(fixture.left(), fixture.right())
                    : PostingIntersection.intersect(fixture.left(), fixture.right());
            check += consume(result);
        }
        long delta = System.nanoTime() - begin;
        sink = check;
        return new Sample(Math.max(0L, delta / iterations), check);
    }

    private static long consume(int[] result) {
        if (result.length == 0) return 0L;
        return result.length + (long) result[0] + result[result.length - 1];
    }

    private static void append(StringBuilder out, Fixture fixture, String backend, Timing timing) {
        out.append(fixture.scenario()).append('\t').append(fixture.size()).append('\t')
                .append(backend).append('\t').append(timing.min()).append('\t')
                .append(timing.median()).append('\t').append(timing.max()).append('\t')
                .append(timing.checksum()).append('\n');
    }

    private static long min(long[] items) { return Arrays.stream(items).min().orElseThrow(); }
    private static long max(long[] items) { return Arrays.stream(items).max().orElseThrow(); }
    private static long median(long[] items) {
        long[] sorted = items.clone();
        Arrays.sort(sorted);
        return sorted[sorted.length / 2];
    }

    private static List<Fixture> fixtures() {
        List<Fixture> result = new ArrayList<>(SIZES.length * SHAPES.length);
        for (int size : SIZES) {
            int[] left = new int[size];
            for (int i = 0; i < size; i++) left[i] = i * 2;
            for (String shape : SHAPES) {
                int[] right = new int[size];
                int overlap = switch (shape) {
                    case "disjoint" -> 0;
                    case "half" -> size / 2;
                    case "equal" -> size;
                    default -> throw new IllegalStateException("unknown fixture");
                };
                for (int i = 0; i < size; i++) {
                    right[i] = shape.equals("disjoint") ? i * 2 + 1
                            : (i + size - overlap) * 2;
                }
                PostingIntersection.validate(left);
                PostingIntersection.validate(right);
                result.add(new Fixture(shape, size, left.clone(), right, overlap));
            }
        }
        return List.copyOf(result);
    }

    private static Options parse(String[] args) {
        Objects.requireNonNull(args, "args");
        int warmup = 48, samples = 7, iterations = 250;
        Path library = null;
        String sha256 = null;
        boolean wasWarmup = false, wasSamples = false, wasIterations = false;
        boolean wasLib = false, wasDigest = false;
        for (String arg : args) {
            Objects.requireNonNull(arg, "argument");
            if (arg.startsWith("--warmup=") && !wasWarmup) {
                warmup = number(arg.substring(9), 1, 10_000, "warmup");
                wasWarmup = true;
            } else if (arg.startsWith("--samples=") && !wasSamples) {
                samples = number(arg.substring(10), 3, 31, "samples");
                wasSamples = true;
            } else if (arg.startsWith("--iterations=") && !wasIterations) {
                iterations = number(arg.substring(13), 1, 10_000, "iterations");
                wasIterations = true;
            } else if (arg.startsWith("--jni-lib=") && !wasLib) {
                library = Path.of(arg.substring(10));
                wasLib = true;
            } else if (arg.startsWith("--jni-sha256=") && !wasDigest) {
                sha256 = arg.substring(13);
                wasDigest = true;
            } else {
                throw new IllegalArgumentException("unsupported or duplicate benchmark option");
            }
        }
        if (wasLib != wasDigest) throw new IllegalArgumentException("paired JNI path and digest required");
        if (wasLib && !sha256.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("invalid SHA-256 pin");
        }
        // Every operation inspects at most two postings arrays. Budget all timings and warmups.
        long elements = 0;
        for (int size : SIZES) elements += (long) SHAPES.length * size * 2;
        long invocations = (long) warmup + (long) samples * iterations;
        long total = Math.multiplyExact(Math.multiplyExact(elements, invocations), wasLib ? 2L : 1L);
        if (total > MAX_WORK) throw new IllegalArgumentException("benchmark work budget exceeded");
        return new Options(warmup, samples, iterations, library, sha256);
    }

    private static int number(String input, int min, int max, String label) {
        if (!input.matches("[0-9]{1,5}")) throw new IllegalArgumentException("invalid " + label);
        int result = Integer.parseInt(input);
        if (result < min || result > max) throw new IllegalArgumentException("invalid " + label);
        return result;
    }
}
