package io.synexia.chromeagent;

import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Deterministic source/category/prefix oracle and negative-admission regression. */
public final class ProblemSearchContractTest {
    private static int checks;
    private ProblemSearchContractTest() { }

    private static void yes(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }
    private static void refused(Runnable action, String message) {
        try { action.run(); }
        catch (IllegalArgumentException expected) { checks++; return; }
        throw new AssertionError(message);
    }
    private static List<String> ids(List<ProblemSearchIndex.Hit> hits) {
        return hits.stream().map(h -> h.reference().source() + ":" + h.reference().id()).toList();
    }
    private static ProblemReference reference(String id, String title) {
        return new ProblemReference(ProblemReference.Source.LEETCODE, id, "search", title,
                List.of("prefix"), URI.create("https://leetcode.com/problems/" + id + "/"));
    }

    public static void main(String[] args) {
        List<ProblemReference> seed = ProblemSeeds.verified();
        ProblemSearchIndex index = new ProblemSearchIndex(seed);
        yes(index.records().size() == 8, "seed size");
        yes(index.search("", ProblemReference.Source.LEETCODE, null, 20).size() == 3,
                "source filter");
        yes(index.search("", null, "graph", 20).size() == 3, "category filter");
        yes(index.search("", ProblemReference.Source.HACKERRANK, "graph", 20).size() == 1,
                "source/category intersection");
        yes(index.search("", ProblemReference.Source.HACKERRANK, "streaming", 20).size() == 1,
                "streaming filter");
        yes(index.search("trie", null, null, 20).size() == 3, "index term and tags");
        yes(index.search("prefix trie", null, null, 20).size() == 3, "AND term intersection");
        yes(index.search("prefix", ProblemReference.Source.HACKERRANK, "search", 20).size() == 1,
                "filtered tag");
        yes(index.search("topologi*", null, null, 20).size() == 2, "prefix match");
        yes(index.search("topologi*", null, null, 20).get(0).reference().source()
                == ProblemReference.Source.GEEKSFORGEEKS, "rank weighting");
        yes(index.search("binary search", null, null, 20).size() == 1, "title tokens");
        yes(index.search("missingtoken", null, null, 20).isEmpty(), "missing tokens");
        yes(index.search("", null, "not-in-catalogue", 20).isEmpty(), "missing category");
        yes(index.search("TRIE trie", null, null, 20).equals(
                index.search("trie", null, null, 20)), "query dedup and case");
        yes(index.search("prefix", null, null, 1).size() == 1, "result limit");
        List<ProblemSearchIndex.Hit> hits = index.search("prefix", null, null, 20);
        Set<String> distinct = new HashSet<>(ids(hits));
        yes(distinct.size() == hits.size(), "unique postings");
        try { hits.clear(); throw new AssertionError("mutable results"); }
        catch (UnsupportedOperationException expected) { checks++; }
        try { index.records().clear(); throw new AssertionError("mutable records"); }
        catch (UnsupportedOperationException expected) { checks++; }
        try { seed.get(0).tags().clear(); throw new AssertionError("mutable tags"); }
        catch (UnsupportedOperationException expected) { checks++; }

        // All input reorderings in a deterministic rotation/mirror corpus must yield the same index.
        List<ProblemReference> reordered = new ArrayList<>(seed);
        List<String> baseline = ids(index.search("", null, "search", 100));
        for (int k = 0; k < 48; k++) {
            Collections.rotate(reordered, 1);
            if ((k & 1) == 1) Collections.reverse(reordered);
            ProblemSearchIndex rotated = new ProblemSearchIndex(reordered);
            yes(rotated.records().equals(index.records()), "input-order independent catalogue");
            yes(ids(rotated.search("", null, "search", 100)).equals(baseline),
                    "input-order independent hits");
        }

        refused(() -> index.search("", null, null, 10), "unbounded browse");
        refused(() -> index.search("a*", null, null, 10), "short prefix");
        refused(() -> index.search("go**", null, null, 10), "malformed prefix");
        refused(() -> index.search("two?", null, null, 10), "unsupported symbol");
        refused(() -> index.search("a b c d e f g h i j k l m n o p q", null, null, 10), "term count");
        refused(() -> index.search("z".repeat(257), null, null, 10), "query size");
        refused(() -> index.search("prefix", null, null, 0), "zero limit");
        refused(() -> index.search("prefix", null, null, 101), "unbounded limit");
        refused(() -> index.search("", null, "GRAPH", 10), "uppercase category");
        refused(() -> new ProblemSearchIndex(List.of(seed.get(0), seed.get(0))), "duplicate source/id");
        refused(() -> reference("bad", "A\nB"), "control title");
        refused(() -> new ProblemReference(ProblemReference.Source.HACKERRANK, "bad", "search",
                "Bad", List.of(), URI.create("https://leetcode.com/problems/bad/")),
                "origin substitution");
        refused(() -> new ProblemReference(ProblemReference.Source.LEETCODE, "bad", "search",
                "Bad", List.of(), URI.create("https://leetcode.com/problems/bad/?q=1")),
                "query URL");
        refused(() -> new ProblemReference(ProblemReference.Source.LEETCODE, "bad", "search",
                "Bad", List.of("prefix", "prefix"), URI.create("https://leetcode.com/problems/bad/")),
                "duplicate tags");
        List<ProblemReference> capacity = new ArrayList<>(Collections.nCopies(4097, seed.get(0)));
        refused(() -> new ProblemSearchIndex(capacity), "corpus capacity");
        List<ProblemReference> broadVocabulary = new ArrayList<>();
        for (int i = 0; i < 129; i++) {
            String suffix = String.format(java.util.Locale.ROOT, "%03d", i);
            broadVocabulary.add(reference("item-" + suffix, "pr" + suffix));
        }
        ProblemSearchIndex overflow = new ProblemSearchIndex(broadVocabulary);
        refused(() -> overflow.search("pr*", null, null, 100), "silent prefix truncation");
        yes(overflow.search("pr000", null, null, 100).size() == 1, "specific exact token");
        System.out.println("ProblemSearchContractTest PASS checks=" + checks);
    }
}
