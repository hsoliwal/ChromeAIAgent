package io.synexia.chromeagent;

import java.net.URI;
import java.util.List;
import java.util.Objects;
import java.util.TreeSet;

/** Licensed-metadata-only reference; the referenced problem is never downloaded. */
public record ProblemReference(Source source, String id, String category, String title,
                               List<String> tags, URI uri) {
    public enum Source {
        LEETCODE("leetcode.com", "/problems/"),
        HACKERRANK("www.hackerrank.com", "/challenges/"),
        GEEKSFORGEEKS("www.geeksforgeeks.org", "/dsa/");

        private final String host;
        private final String pathPrefix;
        Source(String host, String pathPrefix) {
            this.host = host;
            this.pathPrefix = pathPrefix;
        }
    }

    public ProblemReference {
        Objects.requireNonNull(source, "source");
        requireSlug(id);
        requireSlug(category);
        if (title == null || title.isEmpty() || title.length() > 128) {
            throw new IllegalArgumentException("invalid title length");
        }
        for (int i = 0; i < title.length(); i++) {
            if (title.charAt(i) < 32 || title.charAt(i) > 126) {
                throw new IllegalArgumentException("title must be printable ASCII");
            }
        }
        Objects.requireNonNull(tags, "tags");
        if (tags.size() > 16) {
            throw new IllegalArgumentException("too many tags");
        }
        TreeSet<String> canonicalTags = new TreeSet<>();
        for (String tag : tags) {
            requireSlug(tag);
            if (!canonicalTags.add(tag)) {
                throw new IllegalArgumentException("duplicate tag");
            }
        }
        tags = List.copyOf(canonicalTags);
        Objects.requireNonNull(uri, "uri");
        String expectedPath = source.pathPrefix + id
                + (source == Source.HACKERRANK ? "/problem" : "/");
        if (!"https".equals(uri.getScheme()) || !source.host.equals(uri.getHost())
                || uri.getPort() != -1 || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || !expectedPath.equals(uri.getRawPath())) {
            throw new IllegalArgumentException("unapproved problem reference origin/path");
        }
    }

    static void requireSlug(String value) {
        if (value == null || !value.matches("[a-z][a-z0-9-]{0,63}")) {
            throw new IllegalArgumentException("invalid problem slug");
        }
    }
}
