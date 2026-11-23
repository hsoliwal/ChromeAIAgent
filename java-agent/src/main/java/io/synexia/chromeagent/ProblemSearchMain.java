package io.synexia.chromeagent;

import java.io.IOException;
import java.io.PrintStream;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Opt-in local CLI; one query, immutable catalogue, no network or file mutation. */
public final class ProblemSearchMain {
    private ProblemSearchMain() { }

    public static void main(String[] args) throws IOException {
        run(args, System.out);
    }

    static void run(String[] args, PrintStream output) throws IOException {
        Objects.requireNonNull(args, "args");
        Objects.requireNonNull(output, "output");
        ProblemReference.Source source = null;
        String category = null;
        Path catalogue = null;
        int limit = 20;
        boolean setLimit = false;
        List<String> terms = new ArrayList<>();
        boolean readingTerms = false;
        for (String arg : args) {
            Objects.requireNonNull(arg, "argument");
            if (!arg.startsWith("--")) readingTerms = true;
            if (!readingTerms && arg.startsWith("--tsv=")) {
                if (catalogue != null) throw new IllegalArgumentException("duplicate catalogue option");
                catalogue = Path.of(arg.substring(6));
            } else if (!readingTerms && arg.startsWith("--source=")) {
                if (source != null) throw new IllegalArgumentException("duplicate source option");
                source = ProblemCatalogueTsv.parseSource(arg.substring(9));
            } else if (!readingTerms && arg.startsWith("--category=")) {
                if (category != null) throw new IllegalArgumentException("duplicate category option");
                category = arg.substring(11);
                ProblemReference.requireSlug(category);
            } else if (!readingTerms && arg.startsWith("--limit=")) {
                if (setLimit) throw new IllegalArgumentException("duplicate limit option");
                setLimit = true;
                try { limit = Integer.parseInt(arg.substring(8)); }
                catch (NumberFormatException bad) { throw new IllegalArgumentException("invalid limit", bad); }
            } else if (arg.startsWith("--")) {
                throw new IllegalArgumentException("unknown option or option after query");
            } else {
                terms.add(arg);
                if (terms.size() > 16) throw new IllegalArgumentException("too many query arguments");
            }
        }
        List<ProblemReference> items = catalogue == null
                ? ProblemSeeds.verified() : ProblemCatalogueTsv.load(catalogue);
        List<ProblemSearchIndex.Hit> matches = new ProblemSearchIndex(items).search(
                String.join(" ", terms), source, category, limit);
        output.println("source\tid\tcategory\tscore\turl\ttitle");
        for (ProblemSearchIndex.Hit hit : matches) {
            ProblemReference ref = hit.reference();
            output.print(ref.source().name().toLowerCase(java.util.Locale.ROOT));
            output.print('\t');
            output.print(ref.id());
            output.print('\t');
            output.print(ref.category());
            output.print('\t');
            output.print(hit.score());
            output.print('\t');
            output.print(ref.uri());
            output.print('\t');
            output.println(ref.title());
        }
    }
}
