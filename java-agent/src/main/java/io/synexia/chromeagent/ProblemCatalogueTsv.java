package io.synexia.chromeagent;

import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.ArrayList;

/** Strict, local-only catalogue admission: no redirects, crawling or implicit IO writes. */
public final class ProblemCatalogueTsv {
    private static final String HEADER = "source\tid\tcategory\ttitle\ttags\turl";
    private ProblemCatalogueTsv() { }

    public static List<ProblemReference> load(Path path) throws IOException {
        Objects.requireNonNull(path, "path");
        if (!path.isAbsolute() || !Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)
                || Files.isSymbolicLink(path) || Files.size(path) > 2_097_152L) {
            throw new IOException("catalogue requires an existing approved absolute regular file <=2 MiB");
        }
        byte[] bytes = Files.readAllBytes(path);
        if (bytes.length > 2_097_152) throw new IOException("catalogue capacity exceeded");
        final String document;
        try {
            document = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException malformed) {
            throw new IOException("malformed UTF-8 catalogue", malformed);
        }
        String[] lines = document.split("\\r?\\n", -1);
        if (lines.length == 0 || !HEADER.equals(lines[0])) {
            throw new IOException("invalid catalogue header");
        }
        List<ProblemReference> entries = new ArrayList<>();
        Set<String> distinct = new HashSet<>();
        for (int line = 1; line < lines.length; line++) {
            if (line == lines.length - 1 && lines[line].isEmpty()) continue;
            if (entries.size() >= 4096) throw new IOException("catalogue record limit exceeded");
            String[] columns = lines[line].split("\t", -1);
            if (columns.length != 6) throw new IOException("invalid catalogue column count at row " + (line + 1));
            try {
                ProblemReference.Source source = parseSource(columns[0]);
                List<String> tags = columns[4].isEmpty() ? List.of()
                        : Arrays.asList(columns[4].split(",", -1));
                ProblemReference value = new ProblemReference(source, columns[1], columns[2],
                        columns[3], tags, URI.create(columns[5]));
                if (!distinct.add(source.name() + ":" + value.id())) {
                    throw new IllegalArgumentException("duplicate source/id");
                }
                entries.add(value);
            } catch (IllegalArgumentException bad) {
                throw new IOException("invalid catalogue record at row " + (line + 1), bad);
            }
        }
        return List.copyOf(entries);
    }

    static ProblemReference.Source parseSource(String value) {
        return switch (value) {
            case "leetcode" -> ProblemReference.Source.LEETCODE;
            case "hackerrank" -> ProblemReference.Source.HACKERRANK;
            case "geeksforgeeks" -> ProblemReference.Source.GEEKSFORGEEKS;
            default -> throw new IllegalArgumentException("invalid catalogue source");
        };
    }
}
