package io.synexia.chromeagent;

import java.net.URI;
import java.util.List;

/** Small original metadata seed: references only, no problem statements or solutions. */
public final class ProblemSeeds {
    private ProblemSeeds() { }

    public static List<ProblemReference> verified() {
        return List.of(
            ref(ProblemReference.Source.LEETCODE, "course-schedule-ii", "graph",
                "Course Schedule II", List.of("topological-sort", "kahn"),
                "https://leetcode.com/problems/course-schedule-ii/"),
            ref(ProblemReference.Source.LEETCODE, "implement-trie-prefix-tree", "search",
                "Implement Trie Prefix Tree", List.of("prefix", "trie", "index"),
                "https://leetcode.com/problems/implement-trie-prefix-tree/"),
            ref(ProblemReference.Source.LEETCODE, "binary-search", "search",
                "Binary Search", List.of("array", "binary-search"),
                "https://leetcode.com/problems/binary-search/"),
            ref(ProblemReference.Source.HACKERRANK, "contacts", "search",
                "Contacts", List.of("prefix", "trie", "index"),
                "https://www.hackerrank.com/challenges/contacts/problem"),
            ref(ProblemReference.Source.HACKERRANK, "ctci-bfs-shortest-reach", "graph",
                "BFS Shortest Reach", List.of("bfs", "shortest-path"),
                "https://www.hackerrank.com/challenges/ctci-bfs-shortest-reach/problem"),
            ref(ProblemReference.Source.HACKERRANK, "ctci-find-the-running-median", "streaming",
                "Find the Running Median", List.of("heap", "two-heaps"),
                "https://www.hackerrank.com/challenges/ctci-find-the-running-median/problem"),
            ref(ProblemReference.Source.GEEKSFORGEEKS, "topological-sorting-indegree-based-solution", "graph",
                "Topological Sorting using BFS", List.of("kahn", "topological-sort"),
                "https://www.geeksforgeeks.org/dsa/topological-sorting-indegree-based-solution/"),
            ref(ProblemReference.Source.GEEKSFORGEEKS, "trie-insert-and-search", "search",
                "Trie Data Structure", List.of("prefix", "trie", "index"),
                "https://www.geeksforgeeks.org/dsa/trie-insert-and-search/")
        );
    }

    private static ProblemReference ref(ProblemReference.Source source, String id,
            String category, String title, List<String> tags, String url) {
        return new ProblemReference(source, id, category, title, tags, URI.create(url));
    }
}
