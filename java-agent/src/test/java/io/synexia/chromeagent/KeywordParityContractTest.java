package io.synexia.chromeagent;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.util.AbstractList;
import java.util.Collections;
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
        snapshotContracts();
        nativeBoundaryContracts();
        System.out.println("KeywordParityContractTest PASS checks=" + checks);
    }

    private static void snapshotContracts() {
        List<String> overCapacity = new AbstractList<>() {
            @Override public int size() { return 257; }
            @Override public String get(int index) { throw new AssertionError("over-limit list was read"); }
            @Override public <T> T[] toArray(T[] destination) {
                throw new AssertionError("over-limit list was copied before admission");
            }
        };
        try {
            NativeKeywordMatcher.firstIndex("!", overCapacity);
            throw new AssertionError("over-limit list was admitted");
        } catch (IllegalArgumentException expected) { checks++; }

        List<String> changingContents = new AbstractList<>() {
            @Override public int size() { return 1; }
            @Override public String get(int index) { return "click"; }
            @Override public <T> T[] toArray(T[] destination) {
                return List.of("").toArray(destination);
            }
        };
        try {
            NativeKeywordMatcher.firstIndex("!", changingContents);
            throw new AssertionError("JNI accepted an unvalidated candidate snapshot");
        } catch (IllegalArgumentException expected) { checks++; }

        List<String> clearedAfterSnapshot = new AbstractList<>() {
            private boolean copied;
            @Override public int size() { return copied ? 0 : 1; }
            @Override public String get(int index) { return "click"; }
            @Override public <T> T[] toArray(T[] destination) {
                copied = true;
                return List.of("click").toArray(destination);
            }
        };
        if (NativeKeywordMatcher.firstIndex("CLICK", clearedAfterSnapshot) != 0) {
            throw new AssertionError("result validation must use the JNI snapshot length");
        }
        checks++;
    }

    private static void nativeBoundaryContracts() throws ReflectiveOperationException {
        Method nativeMethod = NativeKeywordMatcher.class.getDeclaredMethod(
                "firstIndexNative", String.class, String[].class);
        nativeMethod.setAccessible(true);
        boundaryRefused(nativeMethod, NullPointerException.class, null, new String[] {"click"});
        boundaryRefused(nativeMethod, NullPointerException.class, "click", null);
        for (String pattern : new String[] {null, "", "Click", " click", "click ", "go  to",
                "go\tto", "go\nto", "a1", "é", "a".repeat(129)}) {
            boundaryRefused(nativeMethod, IllegalArgumentException.class, "click", new String[] {pattern});
            // A valid earlier match cannot hide a later malformed candidate.
            boundaryRefused(nativeMethod, IllegalArgumentException.class, "click", new String[] {"click", pattern});
        }
        for (int value = 0; value <= 127; value++) {
            String text = Character.toString((char) value);
            boolean valid = value >= 32 && value <= 126 || value == 9 || value == 10 || value == 13;
            if (valid) same(text, List.of("a"), value == 'a' || value == 'A' ? 0 : -1);
            else boundaryRefused(nativeMethod, IllegalArgumentException.class, text, new String[] {"a"});
        }
        for (String text : List.of("é", "\ud800", "\ud83d\ude00", "x\u0000y")) {
            boundaryRefused(nativeMethod, IllegalArgumentException.class, text, new String[] {"a"});
        }
        boundaryRefused(nativeMethod, IllegalArgumentException.class,
                "!".repeat(1_048_577), new String[0]);
        boundaryRefused(nativeMethod, IllegalArgumentException.class,
                "!", Collections.nCopies(257, "a").toArray(String[]::new));
        boundaryRefused(nativeMethod, IllegalArgumentException.class,
                "!".repeat(32_769), Collections.nCopies(256, "a").toArray(String[]::new));
        same("a".repeat(128), List.of("a".repeat(128)), 0);
        same("!".repeat(1_048_576), Collections.nCopies(8, "a"), -1);
        same("A", Collections.nCopies(256, "a"), 0);
    }

    private static void boundaryRefused(Method method, Class<? extends Throwable> expected,
                                        String text, String[] candidates) throws ReflectiveOperationException {
        try {
            method.invoke(null, text, candidates);
        } catch (InvocationTargetException wrapped) {
            if (!expected.isInstance(wrapped.getCause())) {
                throw new AssertionError("unexpected native boundary failure", wrapped.getCause());
            }
            checks++;
            return;
        }
        throw new AssertionError("native boundary accepted malformed keyword input");
    }
}
