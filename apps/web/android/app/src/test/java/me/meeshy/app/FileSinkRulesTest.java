package me.meeshy.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

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
}
