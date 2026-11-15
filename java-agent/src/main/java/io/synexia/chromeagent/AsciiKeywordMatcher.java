package io.synexia.chromeagent;

import java.util.List;
import java.util.Objects;

/** Bounded ASCII whole-word phrase search; first match uses caller candidate priority. */
public final class AsciiKeywordMatcher {
    private static final int MAX_TEXT_CHARS = 1_048_576;
    private static final int MAX_PATTERNS = 256;
    private static final long MAX_CANDIDATE_POSITIONS = 8_388_608L;

    private AsciiKeywordMatcher() { }

    public static int firstIndex(String text, List<String> candidates) {
        validate(text, candidates);
        for (int k = 0; k < candidates.size(); k++) {
            String pattern = candidates.get(k);
            for (int i = 0; i + pattern.length() <= text.length(); i++) {
                if ((i == 0 || !isWord(text.charAt(i - 1)))
                        && (i + pattern.length() == text.length()
                            || !isWord(text.charAt(i + pattern.length())))
                        && equalsAsciiIgnoreCase(text, i, pattern)) {
                    return k;
                }
            }
        }
        return -1;
    }

    static void validate(String text, List<String> candidates) {
        Objects.requireNonNull(text, "text");
        Objects.requireNonNull(candidates, "candidates");
        if (text.length() > MAX_TEXT_CHARS || candidates.size() > MAX_PATTERNS
                || (long) text.length() * candidates.size() > MAX_CANDIDATE_POSITIONS) {
            throw new IllegalArgumentException("matcher capacity exceeded");
        }
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c > 126 || (c < 32 && c != '\t' && c != '\r' && c != '\n')) {
                throw new IllegalArgumentException("non-ASCII text");
            }
        }
        for (String pattern : candidates) {
            if (pattern == null || pattern.length() == 0 || pattern.length() > 128
                    || !pattern.matches("[a-z]+(?: [a-z]+)*")) {
                throw new IllegalArgumentException("invalid keyword");
            }
        }
    }

    private static boolean isWord(char ch) {
        return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')
                || (ch >= '0' && ch <= '9') || ch == '_';
    }

    private static boolean equalsAsciiIgnoreCase(String text, int offset, String pattern) {
        for (int j = 0; j < pattern.length(); j++) {
            char ch = text.charAt(offset + j);
            if (ch >= 'A' && ch <= 'Z') {
                ch = (char) (ch + ('a' - 'A'));
            }
            if (ch != pattern.charAt(j)) {
                return false;
            }
        }
        return true;
    }
}
