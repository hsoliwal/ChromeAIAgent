package io.synexia.chromeagent;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

/** True JNI execution, bounded exhaustive pairing and Java-index equivalence. */
public final class PostingParityContractTest {
    private static int checks;
    private PostingParityContractTest() { }

    private static void same(int[] left, int[] right) {
        int[] inputA = left.clone(), inputB = right.clone();
        int[] javaResult = PostingIntersection.intersect(left, right);
        int[] nativeResult = NativePostingIntersection.intersect(left, right);
        if (!Arrays.equals(javaResult, nativeResult)
                || !Arrays.equals(left, inputA) || !Arrays.equals(right, inputB)) {
            throw new AssertionError("posting parity/mutation failure");
        }
        checks++;
    }
    private static void refused(Runnable action, String msg) {
        try { action.run(); }
        catch (IllegalArgumentException expected) { checks++; return; }
        throw new AssertionError(msg);
    }
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("native path argument required");
        NativePostingIntersection.load(Path.of(args[0]));
        same(new int[0], new int[0]);
        same(new int[0], new int[] {0, 1});
        same(new int[] {0, 1}, new int[0]);
        same(new int[] {1, 3, 5}, new int[] {2, 4, 6});
        same(new int[] {0, 1, 3}, new int[] {0, 2, 3});
        for (int maskA = 0; maskA < 128; maskA++) {
            for (int maskB = 0; maskB < 128; maskB++) {
                same(maskToArray(maskA), maskToArray(maskB));
            }
        }
        int[] full = new int[4096];
        int[] even = new int[2048];
        for (int i = 0; i < 4096; i++) {
            full[i] = i;
            if ((i & 1) == 0) even[i / 2] = i;
        }
        same(full, even);
        same(full, full);
        refused(() -> PostingIntersection.intersect(new int[] {-1}, new int[0]), "negative Java ID");
        refused(() -> NativePostingIntersection.intersect(new int[] {-1}, new int[0]), "negative JNI ID");
        refused(() -> PostingIntersection.intersect(new int[] {1, 1}, new int[0]), "duplicate Java ID");
        refused(() -> NativePostingIntersection.intersect(new int[] {1, 1}, new int[0]), "duplicate JNI ID");
        refused(() -> PostingIntersection.intersect(new int[] {5, 3}, new int[0]), "unsorted Java ID");
        refused(() -> NativePostingIntersection.intersect(new int[] {5, 3}, new int[0]), "unsorted JNI ID");
        refused(() -> PostingIntersection.intersect(new int[4097], new int[0]), "oversized Java array");
        refused(() -> NativePostingIntersection.intersect(new int[4097], new int[0]), "oversized JNI array");
        ProblemSearchIndex javaIndex = new ProblemSearchIndex(ProblemSeeds.verified());
        ProblemSearchIndex nativeIndex = new ProblemSearchIndex(ProblemSeeds.verified(), ProblemSearchIndex.Backend.JNI);
        for (String query : List.of("graph", "prefix", "trie", "prefix trie", "topologi*", "binary search", "missing")) {
            for (ProblemReference.Source source : ProblemReference.Source.values()) {
                List<ProblemSearchIndex.Hit> expected = javaIndex.search(query, source, null, 100);
                List<ProblemSearchIndex.Hit> actual = nativeIndex.search(query, source, null, 100);
                if (!expected.equals(actual)) throw new AssertionError("JNI index search divergence");
                checks++;
            }
        }
        System.out.println("PostingParityContractTest PASS checks=" + checks);
    }

    private static int[] maskToArray(int mask) {
        int[] result = new int[Integer.bitCount(mask)];
        int index = 0;
        for (int i = 0; i < 7; i++) if ((mask & (1 << i)) != 0) result[index++] = i;
        return result;
    }
}
