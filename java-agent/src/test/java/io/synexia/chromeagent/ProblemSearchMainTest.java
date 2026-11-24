package io.synexia.chromeagent;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;

/** CLI determinism, user-selected catalogue and explicit option refusal. */
public final class ProblemSearchMainTest {
    private static int checks;
    /** {@link PrintStream#println} ends rows with the host separator: LF on Linux, CRLF on Windows. */
    private static final String EOL = System.lineSeparator();
    private ProblemSearchMainTest() { }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }
    private static String output(String... args) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (PrintStream out = new PrintStream(bytes, true, StandardCharsets.UTF_8)) {
            ProblemSearchMain.run(args, out);
        }
        return bytes.toString(StandardCharsets.UTF_8);
    }
    private static int rows(String text) {
        return text.split(Pattern.quote(EOL)).length;
    }
    private static void refused(String... args) throws Exception {
        try { output(args); }
        catch (IllegalArgumentException expected) { checks++; return; }
        throw new AssertionError("accepted invalid CLI options");
    }

    public static void main(String[] args) throws Exception {
        String prefix = output("--source=hackerrank", "--category=search", "prefix");
        check(prefix.startsWith("source\tid\tcategory\tscore\turl\ttitle" + EOL), "fixed header");
        check(prefix.contains("hackerrank\tcontacts\tsearch\t"), "filtered seed");
        check(!prefix.contains("leetcode\t"), "source isolation");
        check(prefix.equals(output("--source=hackerrank", "--category=search", "prefix")),
                "stable replay");
        check(rows(output("--category=graph")) == 4, "filter-only browse");
        check(rows(output("--source=leetcode", "--limit=1", "search")) == 2, "explicit limit");
        Path file = Path.of("target", "problem-search-cli-fixture.tsv").toAbsolutePath();
        Files.createDirectories(file.getParent());
        Files.writeString(file, "source\tid\tcategory\ttitle\ttags\turl\n"
                + "leetcode\tbinary-search\tsearch\tBinary Search\tarray\thttps://leetcode.com/problems/binary-search/\n");
        check(output("--tsv=" + file, "binary").contains("leetcode\tbinary-search"),
                "external verified catalogue");
        check(!output("--tsv=" + file, "--category=graph").contains("binary-search"),
                "filter excludes source metadata");
        refused();
        refused("--source=unknown", "x");
        refused("--source=leetcode", "--source=hackerrank", "x");
        refused("--category=GRAPH", "x");
        refused("--category=graph", "--category=search", "x");
        refused("--limit=0", "x");
        refused("--limit=101", "x");
        refused("--limit=bad", "x");
        refused("x", "--limit=3");
        refused("--unknown=true", "x");
        System.out.println("ProblemSearchMainTest PASS checks=" + checks);
    }
}
