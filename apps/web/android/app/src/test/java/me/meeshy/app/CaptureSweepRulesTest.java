package me.meeshy.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import org.junit.Test;

/** Une photo prise depuis le composer ne reste pas sur le telephone, comme dans Chrome (#12744). */
public class CaptureSweepRulesTest {

    private static final long NOW = 1_800_000_000_000L;
    private static final long HOUR = 60L * 60 * 1000;

    private static File file(File dir, String name, long ageMs) throws IOException {
        File file = new File(dir, name);
        Files.write(file.toPath(), new byte[] {1, 2, 3});
        file.setLastModified(NOW - ageMs);
        return file;
    }

    @Test
    public void anOldCaptureIsSwept() throws IOException {
        File dir = Files.createTempDirectory("pictures").toFile();
        File old = file(dir, "JPEG_20261024_101500_123456789.jpg", 2 * HOUR);
        CaptureSweepRules.sweep(dir, NOW);
        assertFalse(old.exists());
    }

    @Test
    public void aRecentCaptureIsKept() throws IOException {
        File dir = Files.createTempDirectory("pictures").toFile();
        File recent = file(dir, "JPEG_20261024_101500_123456789.jpg", HOUR / 2);
        CaptureSweepRules.sweep(dir, NOW);
        assertTrue(recent.exists());
    }

    @Test
    public void otherFilesOfTheFolderAreKept() throws IOException {
        File dir = Files.createTempDirectory("pictures").toFile();
        File png = file(dir, "JPEG_20261024_101500_1.png", 2 * HOUR);
        File other = file(dir, "souvenir.jpg", 2 * HOUR);
        File folder = new File(dir, "JPEG_dossier.jpg");
        folder.mkdir();
        folder.setLastModified(NOW - 2 * HOUR);
        CaptureSweepRules.sweep(dir, NOW);
        assertTrue(png.exists());
        assertTrue(other.exists());
        assertTrue(folder.exists());
    }

    @Test
    public void aMissingFolderDoesNotThrow() {
        CaptureSweepRules.sweep(null, NOW);
        CaptureSweepRules.sweep(new File("/nonexistent/meeshy/pictures"), NOW);
    }
}
