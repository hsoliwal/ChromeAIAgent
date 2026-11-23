package io.synexia.chromeagent;

import java.util.Arrays;
import java.util.Objects;

/** Two-pointer intersection of strictly ascending, unique document IDs. */
public final class PostingIntersection {
    private PostingIntersection() { }

    public static void validate(int[] values) {
        Objects.requireNonNull(values, "postings");
        if (values.length > 4096) {
            throw new IllegalArgumentException("posting capacity exceeded");
        }
        int previous = -1;
        for (int value : values) {
            if (value <= previous) {
                throw new IllegalArgumentException("postings must be ascending nonnegative unique IDs");
            }
            previous = value;
        }
    }

    public static int[] intersect(int[] left, int[] right) {
        validate(left);
        validate(right);
        int[] output = new int[Math.min(left.length, right.length)];
        int i = 0, j = 0, used = 0;
        while (i < left.length && j < right.length) {
            if (left[i] == right[j]) {
                output[used++] = left[i++];
                j++;
            } else if (left[i] < right[j]) {
                i++;
            } else {
                j++;
            }
        }
        return Arrays.copyOf(output, used);
    }
}
