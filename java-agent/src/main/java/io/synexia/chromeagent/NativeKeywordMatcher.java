package io.synexia.chromeagent;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/** Explicitly loaded JNI candidate matcher; never loads native code implicitly. */
public final class NativeKeywordMatcher {
    private NativeKeywordMatcher() { }

    public static void load(Path approvedAbsoluteLibrary) throws IOException {
        Objects.requireNonNull(approvedAbsoluteLibrary, "approvedAbsoluteLibrary");
        if (!approvedAbsoluteLibrary.isAbsolute() || !Files.isRegularFile(approvedAbsoluteLibrary)) {
            throw new IllegalArgumentException("native library must be an existing absolute file");
        }
        System.load(approvedAbsoluteLibrary.toRealPath().toString());
    }

    public static int firstIndex(String text, List<String> candidates) {
        // Retain admission before allocating an array, including the existing exception order.
        AsciiKeywordMatcher.validate(text, candidates);
        // Validate and bound the same snapshot that crosses JNI, not a mutable caller view.
        String[] snapshot = candidates.toArray(String[]::new);
        AsciiKeywordMatcher.validate(text, Arrays.asList(snapshot));
        int result = firstIndexNative(text, snapshot);
        if (result < -1 || result >= snapshot.length) {
            throw new IllegalStateException("invalid native matcher result");
        }
        return result;
    }

    private static native int firstIndexNative(String text, String[] candidates);
}
