package io.synexia.chromeagent;

import java.nio.file.Path;
import java.util.List;

/** Fixed repeatable Java/JNI parity corpus; requires a real native library. */
public final class KeywordParityContractTest {
    private static int checks;

    private KeywordParityContractTest() { }

    private static void same(String text, List<String> words, int expected) {
        int javaResult = AsciiKeywordMatcher.firstIndex(text, words);
        int nativeResult = NativeKeywordMatcher.firstIndex(text, words);
        if (javaResult != expected || nativeResult != javaResult) {
            throw new AssertionError("parity failure: " + text + ": java=" + javaResult
                    + " native=" + nativeResult + " expected=" + expected);
        }
        checks++;
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("absolute JNI library required");
        NativeKeywordMatcher.load(Path.of(args[0]));
        List<String> words = List.of("click", "go to", "type", "open");
        same("Click the button", words, 0);
        same("type 'hello'", words, 2);
        same("go to https://example.org", words, 1);
        same("open this page", words, 3);
        same("preclick not an action", words, -1);
        same("clickable", words, -1);
        same("click_2", words, -1);
        same("(CLICK)", words, 0);
        same("C L I C K", words, -1);
        same("", words, -1);
        same("open; click", words, 0); // priority is candidate order, not source offset
        same("open; click", List.of("open", "click"), 0);
        same("go  to", words, -1);
        same("GO TO", words, 1);
        same("\tclick\n", words, 0);
        same("please DO something", List.of(), -1);
        for (String prefix : List.of("", "x", "_", ".", "0", "!", " ", "\t")) {
            for (String suffix : List.of("", "x", "_", ".", "0", "!", " ", "\n")) {
                String text = prefix + "CLicK" + suffix;
                int expected = (prefix.isEmpty() || ".! \t".contains(prefix))
                        && (suffix.isEmpty() || ".! \n".contains(suffix)) ? 0 : -1;
                same(text, words, expected);
            }
        }
        for (int n = 0; n <= 128; n++) {
            String prefix = "a".repeat(n);
            same(prefix + " click ", words, 0);
            same(prefix + "click", words, n == 0 ? 0 : -1);
        }
        String tooExpensive = "a".repeat(100_000);
        List<String> manyWords = java.util.Collections.nCopies(100, "a");
        try { AsciiKeywordMatcher.firstIndex(tooExpensive, manyWords);
              throw new AssertionError("Java accepted overbudget match"); }
        catch (IllegalArgumentException expected) { checks++; }
        try { NativeKeywordMatcher.firstIndex(tooExpensive, manyWords);
              throw new AssertionError("native accepted overbudget match"); }
        catch (IllegalArgumentException expected) { checks++; }
        String tooLong = "x".repeat(1_048_577);
        try { AsciiKeywordMatcher.firstIndex(tooLong, words); throw new AssertionError("Java accepted over-limit"); }
        catch (IllegalArgumentException expected) { checks++; }
        try { NativeKeywordMatcher.firstIndex(tooLong, words); throw new AssertionError("native accepted over-limit"); }
        catch (IllegalArgumentException expected) { checks++; }
        try { AsciiKeywordMatcher.firstIndex("é", words); throw new AssertionError("Java accepted Unicode"); }
        catch (IllegalArgumentException expected) { checks++; }
        try { NativeKeywordMatcher.firstIndex("é", words); throw new AssertionError("native accepted Unicode"); }
        catch (IllegalArgumentException expected) { checks++; }
        System.out.println("KeywordParityContractTest PASS checks=" + checks);
    }
}
