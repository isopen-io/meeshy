package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Ce que la carte de lecture accepte de telecharger pour son image (#10624, revue de securite). */
public class PlaybackArtworkRulesTest {

    @Test
    public void onlyMeeshyMediaHostsOverHttpsAreFetched() {
        assertTrue(PlaybackArtworkRules.isFetchable("https://static.meeshy.me/u/i/a.jpg", false));
        assertTrue(PlaybackArtworkRules.isFetchable("https://gate.meeshy.me/api/v1/attachments/file/a", false));
        assertTrue(PlaybackArtworkRules.isFetchable("https://meeshy.me/a.jpg", false));
        assertFalse(PlaybackArtworkRules.isFetchable("http://static.meeshy.me/a.jpg", false));
        assertFalse(PlaybackArtworkRules.isFetchable("https://evil.example/a.jpg", false));
        assertFalse(PlaybackArtworkRules.isFetchable("https://meeshy.me.evil.example/a.jpg", false));
        assertFalse(PlaybackArtworkRules.isFetchable("https://user@static.meeshy.me/a.jpg", false));
        assertFalse(PlaybackArtworkRules.isFetchable("https://93.184.216.34/a.jpg", false));
        assertFalse(PlaybackArtworkRules.isFetchable("https://[::1]/a.jpg", false));
        assertFalse(PlaybackArtworkRules.isFetchable(null, false));
        assertFalse(PlaybackArtworkRules.isFetchable("pas une adresse", false));
    }

    @Test
    public void theLocalGatewayIsFetchedOnlyByADebugBuild() {
        assertTrue(PlaybackArtworkRules.isFetchable("http://localhost:5299/api/v1/attachments/file/a", true));
        assertTrue(PlaybackArtworkRules.isFetchable("http://10.0.2.2:3000/a.jpg", true));
        assertFalse(PlaybackArtworkRules.isFetchable("http://localhost:5299/a.jpg", false));
        assertFalse(PlaybackArtworkRules.isFetchable("http://192.168.1.2/a.jpg", true));
    }

    @Test
    public void aRedirectIsRevalidated() {
        assertEquals("https://static.meeshy.me/b.jpg", PlaybackArtworkRules.redirectTarget("https://gate.meeshy.me/a", "https://static.meeshy.me/b.jpg", false));
        assertEquals("https://gate.meeshy.me/b.jpg", PlaybackArtworkRules.redirectTarget("https://gate.meeshy.me/a", "/b.jpg", false));
        assertNull(PlaybackArtworkRules.redirectTarget("https://gate.meeshy.me/a", "https://evil.example/b.jpg", false));
        assertNull(PlaybackArtworkRules.redirectTarget("https://gate.meeshy.me/a", null, false));
    }

    @Test
    public void anAnnouncedLengthOverTheCapIsRefusedBeforeReading() {
        assertTrue(PlaybackArtworkRules.acceptsLength(-1));
        assertTrue(PlaybackArtworkRules.acceptsLength(PlaybackArtworkRules.MAX_BYTES));
        assertFalse(PlaybackArtworkRules.acceptsLength(PlaybackArtworkRules.MAX_BYTES + 1L));
    }

    @Test
    public void anImageTooLargeToDecodeIsRefusedOnItsDimensions() {
        assertTrue(PlaybackArtworkRules.acceptsDimensions(4096, 3000));
        assertFalse(PlaybackArtworkRules.acceptsDimensions(4097, 10));
        assertFalse(PlaybackArtworkRules.acceptsDimensions(4096, 4096));
        assertFalse(PlaybackArtworkRules.acceptsDimensions(0, 10));
    }

    @Test
    public void theSampleIsComputedOnTheLargestSide() {
        assertEquals(1, PlaybackArtworkRules.sampleSize(400, 300, 512));
        assertEquals(4, PlaybackArtworkRules.sampleSize(4000, 100, 512));
        assertEquals(4, PlaybackArtworkRules.sampleSize(100, 4000, 512));
    }
}
