package io.synexia.chromeagent;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;

/** Explicit native-only alternative: no implicit System.load or silent Java fallback. */
public final class NativePostingIntersection {
    private NativePostingIntersection() { }

    public static void load(Path approvedAbsoluteLibrary) throws IOException {
        Objects.requireNonNull(approvedAbsoluteLibrary, "approvedAbsoluteLibrary");
        if (!approvedAbsoluteLibrary.isAbsolute() || !Files.isRegularFile(approvedAbsoluteLibrary)) {
            throw new IllegalArgumentException("native library must be an existing absolute file");
        }
        System.load(approvedAbsoluteLibrary.toRealPath().toString());
    }

    public static int[] intersect(int[] left, int[] right) {
        PostingIntersection.validate(left);
        PostingIntersection.validate(right);
        int[] result = intersectNative(left, right);
        PostingIntersection.validate(result);
        if (result.length > Math.min(left.length, right.length)) {
            throw new IllegalStateException("native result exceeded intersection cardinality");
        }
        return result;
    }

    private static native int[] intersectNative(int[] left, int[] right);
}
