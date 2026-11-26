// SPDX-License-Identifier: Apache-2.0
package io.synexia.chromeagent;

import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.Set;

/** Full-scan/full-sort oracle independent of posting selection and bounded ranking. */
public final class ProblemSearchRankingContractTest {
    private static final Comparator<ProblemSearchIndex.Hit> ORDER =
            Comparator.comparingInt(ProblemSearchIndex.Hit::score).reversed()
                    .thenComparing(hit -> hit.reference().source())
                    .thenComparing(hit -> hit.reference().id());

    private ProblemSearchRankingContractTest() { }

    static int verify() {
        return verify(ProblemSearchIndex.Backend.JAVA);
    }

    static int verify(ProblemSearchIndex.Backend backend) {
        List<ProblemReference> corpus = mixedCorpus();
        ProblemSearchIndex index = new ProblemSearchIndex(corpus, backend);
        int checks = compareQueries(index, corpus);
        List<ProblemReference> permuted = new ArrayList<>(corpus);
        for (int turn = 0; turn < 4; turn++) {
            Collections.shuffle(permuted, new Random(712L + turn));
            ProblemSearchIndex reordered = new ProblemSearchIndex(permuted, backend);
            for (int limit : new int[] {1, 2, 3, 10, 99, 100}) {
                check(reordered.search("ne*", null, null, limit).equals(
                        index.search("ne*", null, null, limit)), "permutation at " + limit);
                checks++;
            }
        }
        List<ProblemReference> tied = new ArrayList<>();
        for (int i = 4095; i >= 0; i--) {
            tied.add(reference(i, "search", "Needle Common", List.of("needle")));
        }
        ProblemSearchIndex capacity = new ProblemSearchIndex(tied, backend);
        List<ProblemSearchIndex.Hit> oracle = scan(tied, "needle", null, null);
        for (int limit = 1; limit <= 100; limit++) {
            check(capacity.search("needle", null, null, limit).equals(oracle.subList(0, limit)),
                    "capacity ties at " + limit);
            checks++;
        }
        check(new ProblemSearchIndex(List.of(), backend).search("needle", null, null, 100).isEmpty(),
                "empty corpus");
        List<ProblemSearchIndex.Hit> single = new ProblemSearchIndex(List.of(corpus.get(0)), backend)
                .search("", corpus.get(0).source(), null, 100);
        check(single.size() == 1 && single.get(0).reference() == corpus.get(0),
                "reference identity");
        try {
            capacity.search("needle", null, null, 1).set(0, oracle.get(1));
            throw new AssertionError("mutable top results");
        } catch (UnsupportedOperationException expected) {
            checks++;
        }
        return checks + 2;
    }

    private static int compareQueries(ProblemSearchIndex index, List<ProblemReference> corpus) {
        int checks = 0;
        ProblemReference.Source[] sources = {null, ProblemReference.Source.LEETCODE,
                ProblemReference.Source.HACKERRANK, ProblemReference.Source.GEEKSFORGEEKS};
        String[] categories = {null, "search", "graph", "needle", "absent"};
        for (String query : new String[] {"needle", "ne*", "NEEDLE needle", "needle common",
                "needle-search", "common", "missing", ""}) {
            for (ProblemReference.Source source : sources) {
                for (String category : categories) {
                    if (query.isEmpty() && source == null && category == null) continue;
                    List<ProblemSearchIndex.Hit> expected = scan(corpus, query, source, category);
                    for (int limit = 1; limit <= 100; limit++) {
                        check(index.search(query, source, category, limit).equals(
                                expected.subList(0, Math.min(limit, expected.size()))),
                                query + "/" + source + "/" + category + "/" + limit);
                        checks++;
                    }
                }
            }
        }
        return checks;
    }

    private static List<ProblemReference> mixedCorpus() {
        List<ProblemReference> corpus = new ArrayList<>();
        for (int i = 0; i < 641; i++) {
            int variant = (i * 13) % 16;
            String title = (variant & 1) == 0 ? "Common needle item" : "Common other item";
            String category = (variant & 2) == 0 ? "needle" : i % 3 == 0 ? "graph" : "search";
            List<String> tags = (variant & 4) == 0 ? List.of("needle", "search")
                    : (variant & 8) == 0 ? List.of("needles", "search") : List.of("other");
            corpus.add(reference(i, category, title, tags));
        }
        Collections.reverse(corpus);
        return corpus;
    }

    private static ProblemReference reference(int number, String category, String title, List<String> tags) {
        ProblemReference.Source source = ProblemReference.Source.values()[number % 3];
        String id = String.format(Locale.ROOT, "problem-%04d", number);
        String url = switch (source) {
            case LEETCODE -> "https://leetcode.com/problems/" + id + "/";
            case HACKERRANK -> "https://www.hackerrank.com/challenges/" + id + "/problem";
            case GEEKSFORGEEKS -> "https://www.geeksforgeeks.org/dsa/" + id + "/";
        };
        return new ProblemReference(source, id, category, title, tags, URI.create(url));
    }

    private static List<ProblemSearchIndex.Hit> scan(List<ProblemReference> corpus, String query,
            ProblemReference.Source source, String category) {
        Set<String> terms = new LinkedHashSet<>(Arrays.asList(
                query.toLowerCase(Locale.ROOT).split("[\\s-]+")));
        terms.remove("");
        List<ProblemSearchIndex.Hit> results = new ArrayList<>();
        for (ProblemReference ref : corpus) {
            if (source != null && source != ref.source()) continue;
            if (category != null && !category.equals(ref.category())) continue;
            List<Set<String>> fields = List.of(tokens(ref.title()), tokens(ref.category()),
                    tokens(String.join(" ", ref.tags())));
            int total = 0;
            boolean included = true;
            for (String term : terms) {
                int termScore = 0;
                for (int field = 0; field < fields.size(); field++) {
                    for (String word : fields.get(field)) {
                        boolean matches = term.endsWith("*")
                                ? word.startsWith(term.substring(0, term.length() - 1)) : word.equals(term);
                        if (matches) {
                            termScore += new int[] {8, 4, 2}[field];
                            break;
                        }
                    }
                }
                if (termScore == 0) {
                    included = false;
                    break;
                }
                total += termScore;
            }
            if (included) results.add(new ProblemSearchIndex.Hit(ref, total));
        }
        results.sort(ORDER);
        return results;
    }

    private static Set<String> tokens(String input) {
        return new HashSet<>(Arrays.asList(input.toLowerCase(Locale.ROOT).split("[^a-z0-9]+")));
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError("ranking oracle: " + message);
    }
}
