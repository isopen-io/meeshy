package me.meeshy.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import org.junit.Test;

/** `shareFileAt` ne partage qu'un fichier ecrit par le recepteur (#9553). */
public class FileSinkInsideTest {

    @Test
    public void aFileOfTheSinkIsInside() throws IOException {
        File cache = Files.createTempDirectory("cache").toFile();
        File sink = new File(cache, "file-sink");
        assertTrue(sink.mkdirs());
        File written = new File(sink, "a.mp4");
        assertTrue(written.createNewFile());
        assertTrue(FileSinkRules.insideSink(sink, written));
    }

    @Test
    public void anyOtherPathIsOutside() throws IOException {
        File cache = Files.createTempDirectory("cache").toFile();
        File sink = new File(cache, "file-sink");
        assertTrue(sink.mkdirs());
        File secret = new File(cache, "secret.db");
        assertTrue(secret.createNewFile());
        assertFalse(FileSinkRules.insideSink(sink, secret));
        assertFalse(FileSinkRules.insideSink(sink, new File(sink, "../secret.db")));
        assertFalse(FileSinkRules.insideSink(sink, new File(sink, "absent.mp4")));
        assertFalse(FileSinkRules.insideSink(sink, sink));
        assertFalse(FileSinkRules.insideSink(sink, null));
    }
}
