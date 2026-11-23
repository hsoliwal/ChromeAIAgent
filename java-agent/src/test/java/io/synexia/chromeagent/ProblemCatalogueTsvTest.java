package io.synexia.chromeagent;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/** Offline UTF-8 file admission and all-or-nothing row validation. */
public final class ProblemCatalogueTsvTest {
    private static int checks;
    private static final String HEADER = "source\tid\tcategory\ttitle\ttags\turl\n";
    private static final String GOOD = "leetcode\tbinary-search\tsearch\tBinary Search\tarray,binary-search\thttps://leetcode.com/problems/binary-search/\n";
    private ProblemCatalogueTsvTest() { }

    private static void check(boolean success, String description) {
        if (!success) throw new AssertionError(description);
        checks++;
    }
    private static void fails(Path file, byte[] bytes, String description) throws IOException {
        Files.write(file, bytes);
        try { ProblemCatalogueTsv.load(file); }
        catch (IOException expected) { checks++; return; }
        throw new AssertionError(description);
    }
    private static byte[] utf8(String value) { return value.getBytes(StandardCharsets.UTF_8); }

    public static void main(String[] args) throws Exception {
        Path file = Path.of("target", "problem-catalogue-fixture.tsv").toAbsolutePath();
        Files.createDirectories(file.getParent());
        Files.writeString(file, HEADER + GOOD, StandardCharsets.UTF_8);
        List<ProblemReference> records = ProblemCatalogueTsv.load(file);
        check(records.size() == 1, "one record");
        check(records.get(0).tags().equals(List.of("array", "binary-search")), "sorted canonical tags");
        check(records.get(0).uri().toString().equals("https://leetcode.com/problems/binary-search/"),
                "canonical URL retained");
        Files.writeString(file, HEADER, StandardCharsets.UTF_8);
        check(ProblemCatalogueTsv.load(file).isEmpty(), "empty approved catalogue");
        fails(file, utf8("wrong\n" + GOOD), "wrong header");
        fails(file, utf8("\ufeff" + HEADER + GOOD), "BOM accepted");
        fails(file, new byte[] {(byte) 0xC3, (byte) 0x28}, "invalid UTF-8");
        fails(file, utf8(HEADER + GOOD + GOOD), "duplicate source/id");
        fails(file, utf8(HEADER + GOOD.replace("leetcode", "unknown")), "unknown source");
        fails(file, utf8(HEADER + GOOD.replace("https://leetcode.com", "https://evil.example")),
                "foreign origin");
        fails(file, utf8(HEADER + GOOD.replace("array,binary-search", "array,,binary-search")),
                "empty tag");
        fails(file, utf8(HEADER + GOOD.replace("\tsearch\t", "\tSEARCH\t")), "bad category");
        fails(file, utf8(HEADER + GOOD.replace("Binary Search", "Binary\tSearch")), "extra column");
        fails(file, utf8(HEADER + GOOD + "\n"), "internal blank row");
        StringBuilder oversized = new StringBuilder(HEADER);
        for (int i = 0; i < 4097; i++) {
            oversized.append("leetcode\titem-").append(i)
                    .append("\tsearch\tItem\t\thttps://leetcode.com/problems/item-")
                    .append(i).append("/\n");
        }
        fails(file, utf8(oversized.toString()), "row cap not enforced");
        try { ProblemCatalogueTsv.load(Path.of("relative-fixture.tsv"));
              throw new AssertionError("relative catalogue path accepted"); }
        catch (IOException expected) { checks++; }
        check(!ProblemCatalogueTsv.load(writeGood(file)).isEmpty(), "recovery after invalid input");
        System.out.println("ProblemCatalogueTsvTest PASS checks=" + checks);
    }

    private static Path writeGood(Path file) throws IOException {
        Files.writeString(file, HEADER + GOOD, StandardCharsets.UTF_8);
        return file;
    }
}
