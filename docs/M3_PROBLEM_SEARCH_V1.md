# M3 problem-reference search v1 — proposed additive contract

Status: independent, read-only Java 21/JNI indexing layer. This is not a scraper, challenge-solution corpus, model provider, browser tool, or Maven lifecycle change. Existing Java agent public interfaces and Chrome extension behavior are locked.

## Ownership, donor semantics, provenance

`hsoliwal/ChromeAIAgent` owns the bounded, immutable search index and optional JNI posting-list intersection. `hsoliwal/ChromeLLM` owns model inference; `hsoliwal/maven` owns Maven execution; `hsoliwal/com.synexia` owns canonical atomization/recipe promotion. No new owner duplicates any existing contract. Public problem descriptions at LeetCode, HackerRank and GeeksforGeeks are **algorithm references** only. The seed catalogue contains original metadata and verified outbound URLs, not copied solutions, descriptions, test inputs, editorial content or protected user submissions. Respect each service's terms; the search index works on locally supplied, licensed metadata and never fetches from the network.

## API and invariants

* `ProblemReference(source, id, category, title, tags, uri)` stores only original metadata. Sources are `LEETCODE`, `HACKERRANK`, `GEEKSFORGEEKS`; exact HTTPS origin is validated per source, and no credentials, fragments, or noncanonical origin are accepted. Slugs and titles are bounded ASCII, tags are immutable sorted slugs. Duplicate `(source,id)` records fail.
* `ProblemSearchIndex(Collection<ProblemReference>)` accepts up to 4096 records and canonicalizes them by source/id before indexing. It indexes title/category/tag tokens into sorted, unique integer postings. No corpus writes or network calls occur. Input permutation produces the same records and result order.
* `search(String query, Source sourceOrNull, String categoryOrNull, int limit)` permits empty query only with a filter; at most 16 query terms and 256 query characters. A final `*` on a term means prefix matching (minimum two characters); prefix vocabulary expansion exceeding 128 terms is refused rather than truncated. Duplicate terms are eliminated. Unknown source/category return empty results. `limit` must be 1..100.
* Query terms are AND-combined. Prefix expansions are OR-combined within one term. Source/category filters intersect with candidates before ranking. Scoring uses per-term weights: title 8, category 4, tags 2; multiple matched tokens in the same field count once per query term. Ordering is score descending, then source enum order, then ID ascending. All returned result objects and collections are immutable.
* `PostingIntersection.intersect(left,right)` accepts two strictly increasing nonnegative integer arrays (at most 4096 elements each), returns ascending unique intersection; Java reference is linear two-pointer. `NativePostingIntersection.load(absoluteLibrary)` is explicit. Native calls prevalidate arrays via Java, use JNI `jintArray`, and must produce byte-for-byte identical output, without implicit native fallback.
* No untrusted model output authorizes execution, downloads, writes, cross-origin requests or tool registration. No speed claims until repeatable benchmark measures net JNI call overhead.

## Algorithm-category evaluation (reference, not code borrowing)

| Category | Reference donor | Candidate algorithms | Selected implementation | Reason |
| --- | --- | --- | --- | --- |
| Directed dependency ordering | LeetCode 210 `course-schedule-ii`; GeeksforGeeks `topological-sorting-indegree-based-solution` | DFS/Kahn FIFO/Kahn heap | Existing `PlanOrder` min-heap Kahn | Lexical deterministic tie-break; already merged |
| Prefix search | HackerRank `contacts` | Linear scan/trie/sorted vocabulary | Sorted vocabulary + postings union | 4096-document bounded corpus, immutable index, minimal structural overhead |
| Exact multi-term lookup | LeetCode 208 `implement-trie-prefix-tree` (conceptual) | Linear scan/trie/inverted postings | Immutable sorted inverted postings | Efficient selective lookup, no mutable trie ownership |
| Posting intersection | Two-pointer / galloping / bitmap | Two-pointer | Java and JNI two-pointer | Bounded monotonic arrays, straightforward parity and refusal proofs |
| Streaming median | HackerRank `ctci-find-the-running-median` | Sorting/two heaps | Deferred | No streaming quantile requirement; avoid unrelated algorithm code |

## Admission / verification

1. Inventory base commit, file paths and Git object IDs. Document contract before code. Do not modify the browser extension, root manifest, existing Java/JNI API, or build plugin.
2. Add Java index and independent C++ JNI peer; `javac -Xlint:all -Werror` and native `g++ -std=c++17 -Wall -Wextra -Werror` must pass.
3. Run search oracle tests (source/category filters, prefix, ranking, deterministic permutation, refusal and immutability). Run JNI parity on boundary and exhaustive small posting sets with `-Xcheck:jni`.
4. Run existing `java-agent/scripts/verify.sh` unchanged, then the additive search suite. Compare all source SHA-256 and Git blob identities against the publication tree.
5. Publish a draft PR only after source/runtime verification; CI Maven and multi-OS qualification remain separately pending until GitHub checks are observed.
