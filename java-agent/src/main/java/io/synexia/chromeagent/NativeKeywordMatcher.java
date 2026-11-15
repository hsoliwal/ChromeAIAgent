package io.synexia.chromeagent;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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
        AsciiKeywordMatcher.validate(text, candidates);
        int result = firstIndexNative(text, candidates.toArray(String[]::new));
        if (result < -1 || result >= candidates.size()) {
            throw new IllegalStateException("invalid native matcher result");
        }
        return result;
    }

    private static native int firstIndexNative(String text, String[] candidates);
}
