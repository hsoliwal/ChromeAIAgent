package io.synexia.chromeagent;

import java.util.ArrayList;
import java.util.BitSet;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NavigableMap;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;

/** Immutable bounded problem-reference index; source text and solutions never enter the index. */
public final class ProblemSearchIndex {
    public enum Backend { JAVA, JNI }
    public record Hit(ProblemReference reference, int score) { }
    private record Fields(Set<String> title, Set<String> category, Set<String> tags) { }

    private final List<ProblemReference> records;
    private final List<Fields> fields;
    private final NavigableMap<String, int[]> tokens;
    private final Map<ProblemReference.Source, int[]> sources;
    private final Map<String, int[]> categories;
    private final int[] all;
    private final Backend backend;

    public ProblemSearchIndex(Collection<ProblemReference> input) {
        this(input, Backend.JAVA);
    }

    public ProblemSearchIndex(Collection<ProblemReference> input, Backend backend) {
        Objects.requireNonNull(input, "input");
        this.backend = Objects.requireNonNull(backend, "backend");
        if (input.size() > 4096) throw new IllegalArgumentException("catalogue capacity exceeded");
        List<ProblemReference> sorted = new ArrayList<>(input);
        if (sorted.size() > 4096) throw new IllegalArgumentException("catalogue capacity exceeded");
        sorted.sort(Comparator.comparing(ProblemReference::source).thenComparing(ProblemReference::id));
        Set<String> keys = new HashSet<>();
        List<Fields> tempFields = new ArrayList<>(sorted.size());
        Map<String, List<Integer>> wordLists = new TreeMap<>();
        Map<ProblemReference.Source, List<Integer>> sourceLists = new EnumMap<>(ProblemReference.Source.class);
        Map<String, List<Integer>> categoryLists = new TreeMap<>();
        for (int i = 0; i < sorted.size(); i++) {
            ProblemReference ref = Objects.requireNonNull(sorted.get(i), "problem");
            if (!keys.add(ref.source() + ":" + ref.id())) {
                throw new IllegalArgumentException("duplicate source/id");
            }
            Set<String> title = words(ref.title());
            Set<String> category = words(ref.category());
            Set<String> tags = new HashSet<>();
            for (String tag : ref.tags()) tags.addAll(words(tag));
            tempFields.add(new Fields(Set.copyOf(title), Set.copyOf(category), Set.copyOf(tags)));
            Set<String> union = new HashSet<>(title);
            union.addAll(category);
            union.addAll(tags);
            for (String word : union) wordLists.computeIfAbsent(word, unused -> new ArrayList<>()).add(i);
            sourceLists.computeIfAbsent(ref.source(), unused -> new ArrayList<>()).add(i);
            categoryLists.computeIfAbsent(ref.category(), unused -> new ArrayList<>()).add(i);
        }
        records = List.copyOf(sorted);
        fields = List.copyOf(tempFields);
        TreeMap<String, int[]> wordIndex = new TreeMap<>();
        wordLists.forEach((word, ids) -> wordIndex.put(word, toArray(ids)));
        tokens = java.util.Collections.unmodifiableNavigableMap(wordIndex);
        Map<ProblemReference.Source, int[]> bySource = new EnumMap<>(ProblemReference.Source.class);
        sourceLists.forEach((source, ids) -> bySource.put(source, toArray(ids)));
        sources = Map.copyOf(bySource);
        Map<String, int[]> byCategory = new TreeMap<>();
        categoryLists.forEach((category, ids) -> byCategory.put(category, toArray(ids)));
        categories = Map.copyOf(byCategory);
        all = new int[records.size()];
        for (int i = 0; i < all.length; i++) all[i] = i;
    }

    public List<ProblemReference> records() { return records; }

    public List<Hit> search(String query, ProblemReference.Source source,
                            String category, int limit) {
        Objects.requireNonNull(query, "query");
        if (limit < 1 || limit > 100) throw new IllegalArgumentException("limit must be 1..100");
        if (category != null) ProblemReference.requireSlug(category);
        List<String> terms = parseTerms(query);
        if (terms.isEmpty() && source == null && category == null) {
            throw new IllegalArgumentException("empty query requires a filter");
        }
        List<int[]> lists = new ArrayList<>();
        if (source != null) lists.add(sources.getOrDefault(source, new int[0]));
        if (category != null) lists.add(categories.getOrDefault(category, new int[0]));
        for (String term : terms) lists.add(resolve(term));
        lists.sort(Comparator.comparingInt(a -> a.length));
        int[] matches = lists.isEmpty() ? all : lists.get(0);
        for (int i = 1; i < lists.size() && matches.length > 0; i++) {
            matches = backend == Backend.JAVA
                    ? PostingIntersection.intersect(matches, lists.get(i))
                    : NativePostingIntersection.intersect(matches, lists.get(i));
        }
        return topHits(matches, terms, limit);
    }

    /**
     * Keeps only the best requested matches in a worst-first primitive heap.
     * Canonical document IDs already encode the source/id tie order. Ranking
     * uses O(matches log(limit + 1)) work and O(limit) auxiliary storage; Hit objects
     * are created only for the immutable returned result.
     */
    private List<Hit> topHits(int[] matches, List<String> terms, int limit) {
        int capacity = Math.min(limit, matches.length);
        if (capacity == 0) return List.of();
        int[] documents = new int[capacity];
        int[] scores = new int[capacity];
        int size = 0;
        for (int doc : matches) {
            int value = score(fields.get(doc), terms);
            if (size < capacity) {
                int position = size++;
                while (position > 0) {
                    int parent = (position - 1) >>> 1;
                    if (!worse(value, doc, scores[parent], documents[parent])) break;
                    documents[position] = documents[parent];
                    scores[position] = scores[parent];
                    position = parent;
                }
                documents[position] = doc;
                scores[position] = value;
            } else if (worse(scores[0], documents[0], value, doc)) {
                replaceWorst(documents, scores, size, doc, value);
            }
        }
        Hit[] result = new Hit[size];
        while (size > 0) {
            result[--size] = new Hit(records.get(documents[0]), scores[0]);
            if (size > 0) {
                replaceWorst(documents, scores, size, documents[size], scores[size]);
            }
        }
        return List.of(result);
    }

    /** A lower score loses; among equal scores the later canonical ID loses. */
    private static boolean worse(int score, int document, int otherScore, int otherDocument) {
        return score < otherScore || (score == otherScore && document > otherDocument);
    }

    /** Restores the worst-first heap after replacing or removing its root. */
    private static void replaceWorst(int[] documents, int[] scores, int size, int doc, int score) {
        int position = 0;
        while (position < size / 2) {
            int child = position * 2 + 1;
            if (child + 1 < size && worse(scores[child + 1], documents[child + 1],
                    scores[child], documents[child])) child++;
            if (!worse(scores[child], documents[child], score, doc)) break;
            documents[position] = documents[child];
            scores[position] = scores[child];
            position = child;
        }
        documents[position] = doc;
        scores[position] = score;
    }

    private int[] resolve(String term) {
        if (!term.endsWith("*")) return tokens.getOrDefault(term, new int[0]);
        String prefix = term.substring(0, term.length() - 1);
        BitSet found = new BitSet(records.size());
        int expanded = 0;
        for (var entry : tokens.tailMap(prefix, true).entrySet()) {
            if (!entry.getKey().startsWith(prefix)) break;
            if (++expanded > 128) throw new IllegalArgumentException("prefix vocabulary expansion exceeded");
            for (int id : entry.getValue()) found.set(id);
        }
        return found.stream().toArray();
    }

    private static int score(Fields fields, List<String> terms) {
        int total = 0;
        for (String term : terms) {
            String prefix = term.endsWith("*") ? term.substring(0, term.length() - 1) : null;
            if (contains(fields.title(), term, prefix)) total += 8;
            if (contains(fields.category(), term, prefix)) total += 4;
            if (contains(fields.tags(), term, prefix)) total += 2;
        }
        return total;
    }

    private static boolean contains(Set<String> words, String term, String prefix) {
        if (prefix == null) return words.contains(term);
        for (String word : words) if (word.startsWith(prefix)) return true;
        return false;
    }

    private static Set<String> words(String text) {
        Set<String> out = new HashSet<>();
        for (String word : text.toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            if (!word.isEmpty()) out.add(word);
        }
        return out;
    }

    private static List<String> parseTerms(String query) {
        if (query.length() > 256 || !query.matches("[A-Za-z0-9* \\t\\r\\n-]*")) {
            throw new IllegalArgumentException("invalid query alphabet or length");
        }
        LinkedHashSet<String> terms = new LinkedHashSet<>();
        for (String raw : query.toLowerCase(Locale.ROOT).trim().split("[\\s-]+")) {
            if (raw.isEmpty()) continue;
            if (!raw.matches("[a-z0-9]+\\*?")) {
                throw new IllegalArgumentException("invalid query term");
            }
            if (raw.endsWith("*") && raw.length() < 3) {
                throw new IllegalArgumentException("prefix must contain at least two characters");
            }
            terms.add(raw);
            if (terms.size() > 16) throw new IllegalArgumentException("too many query terms");
        }
        return List.copyOf(terms);
    }

    private static int[] toArray(List<Integer> numbers) {
        int[] result = new int[numbers.size()];
        for (int i = 0; i < result.length; i++) result[i] = numbers.get(i);
        return result;
    }
}
