package io.synexia.chromeagent;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;

/** Admission for an explicitly named, byte-pinned library; no implicit loading. */
public final class NativeLibraryAdmission {
    private static final long MAX_BYTES = 64L * 1024L * 1024L;
    private NativeLibraryAdmission() { }

    /** Validate a local immutable artifact; the caller retains origin/license/ABI responsibility. */
    public static Path verify(Path path, String expectedSha256) throws IOException {
        Objects.requireNonNull(path, "path");
        Objects.requireNonNull(expectedSha256, "expectedSha256");
        if (!expectedSha256.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("SHA-256 pin must be lowercase 64-hex");
        }
        if (!path.isAbsolute() || !path.normalize().equals(path)) {
            throw new IllegalArgumentException("native library path must be canonical absolute");
        }
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("native library must be a pre-existing regular non-symlink file");
        }
        final Path real = path.toRealPath();
        if (!real.equals(path)) {
            throw new IOException("native library path traverses a symbolic link");
        }
        BasicFileAttributes before = Files.readAttributes(path, BasicFileAttributes.class,
                LinkOption.NOFOLLOW_LINKS);
        if (before.size() < 1 || before.size() > MAX_BYTES) {
            throw new IOException("native library outside 1..64 MiB admission range");
        }
        MessageDigest digest;
        try { digest = MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException missing) { throw new IllegalStateException("missing SHA-256", missing); }
        long bytes = 0;
        try (InputStream input = Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)) {
            byte[] buffer = new byte[8192];
            for (int count; (count = input.read(buffer)) != -1;) {
                bytes += count;
                if (bytes > MAX_BYTES) throw new IOException("native library changed or exceeded capacity");
                digest.update(buffer, 0, count);
            }
        }
        BasicFileAttributes after = Files.readAttributes(path, BasicFileAttributes.class,
                LinkOption.NOFOLLOW_LINKS);
        if (bytes != before.size() || bytes != after.size()
                || !before.lastModifiedTime().equals(after.lastModifiedTime())
                || before.fileKey() != null && !before.fileKey().equals(after.fileKey())) {
            throw new IOException("native library changed while hashing");
        }
        if (!MessageDigest.isEqual(HexFormat.of().parseHex(expectedSha256), digest.digest())) {
            throw new IOException("native library SHA-256 mismatch");
        }
        return real;
    }
}
