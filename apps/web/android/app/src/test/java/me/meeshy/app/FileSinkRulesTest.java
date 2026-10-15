package me.meeshy.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/** Les bornes du recepteur de fichiers de la coque (#9514). */
public class FileSinkRulesTest {

    @Test
    public void aMediaExtensionIsAllowed() {
        assertTrue(FileSinkRules.extensionAllowed("mp4"));
        assertTrue(FileSinkRules.extensionAllowed("jpeg"));
        assertTrue(FileSinkRules.extensionAllowed("3gp"));
    }

    @Test
    public void aMissingOrPathLikeExtensionIsRefused() {
        assertFalse(FileSinkRules.extensionAllowed(null));
        assertFalse(FileSinkRules.extensionAllowed(""));
        assertFalse(FileSinkRules.extensionAllowed("../x"));
        assertFalse(FileSinkRules.extensionAllowed("mp4/"));
        assertFalse(FileSinkRules.extensionAllowed("averyverylongext"));
    }

    @Test
    public void aChunkFitsUntilTheCeiling() {
        assertTrue(FileSinkRules.fits(0L, 4));
        assertTrue(FileSinkRules.fits(FileSinkRules.MAX_BYTES - 4, 4));
        assertFalse(FileSinkRules.fits(FileSinkRules.MAX_BYTES - 3, 4));
        assertFalse(FileSinkRules.fits(0L, -1));
    }

    @Rule
    public TemporaryFolder cache = new TemporaryFolder();

    @Test
    public void atStartTheLeftoversAreEmptiedOffTheMainThreadAndTheLiveSinkIsKept() throws IOException {
        File live = cache.newFolder("file-sink");
        File opened = new File(live, "ouvert.mp4");
        assertTrue(opened.createNewFile());
        File trash = cache.newFolder(FileSinkRules.TRASH_PREFIX + "a");
        assertTrue(new File(trash, "reste.mp4").createNewFile());
        File interrupted = cache.newFolder(FileSinkRules.TRASH_PREFIX + "b");
        File other = cache.newFolder("WebView");

        FileSinkRules.emptyTrash(cache.getRoot());

        assertFalse(trash.exists());
        assertFalse(interrupted.exists());
        assertTrue(opened.exists());
        assertTrue(other.exists());
    }

    @Test
    public void onlyATrashFolderIsATrash() {
        assertTrue(FileSinkRules.isTrash(FileSinkRules.TRASH_PREFIX + "x"));
        assertFalse(FileSinkRules.isTrash("file-sink"));
        assertFalse(FileSinkRules.isTrash(null));
    }
}
