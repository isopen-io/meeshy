package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * #10626 (revue de securite) — le natif ne telecharge un visage que sur un
 * hote media Meeshy, ne suit une redirection que vers un tel hote, et refuse
 * une image dont les dimensions feraient exploser le decodage.
 */
public class WidgetAvatarRulesTest {

    @Test
    public void onlyMeeshyMediaHostsAreFetchedInRelease() {
        assertTrue(WidgetAvatarRules.isFetchable("https://static.meeshy.me/u/i/a.jpg", false));
        assertTrue(WidgetAvatarRules.isFetchable("https://gate.meeshy.me/api/v1/attachments/file/a.jpg", false));
        assertTrue(WidgetAvatarRules.isFetchable("https://gate.staging.meeshy.me/a.jpg", false));
        assertTrue(WidgetAvatarRules.isFetchable("https://meeshy.me/a.jpg", false));
        assertFalse(WidgetAvatarRules.isFetchable("https://evil.example/a.jpg", false));
        assertFalse(WidgetAvatarRules.isFetchable("https://meeshy.me.evil.example/a.jpg", false));
        assertFalse(WidgetAvatarRules.isFetchable("https://evilmeeshy.me/a.jpg", false));
        assertFalse(WidgetAvatarRules.isFetchable("https://user@evil.example/a.jpg", false));
    }

    @Test
    public void plainHttpIsRefusedInRelease() {
        assertFalse(WidgetAvatarRules.isFetchable("http://static.meeshy.me/a.jpg", false));
        assertFalse(WidgetAvatarRules.isFetchable("http://localhost:5299/a.jpg", false));
        assertFalse(WidgetAvatarRules.isFetchable("http://10.0.2.2:3000/a.jpg", false));
    }

    @Test
    public void theLocalGatewayIsFetchedOnlyInADebugBuild() {
        assertTrue(WidgetAvatarRules.isFetchable("http://localhost:5299/a.jpg", true));
        assertTrue(WidgetAvatarRules.isFetchable("http://10.0.2.2:3000/a.jpg", true));
        assertFalse(WidgetAvatarRules.isFetchable("http://evil.example/a.jpg", true));
    }

    @Test
    public void literalIpAddressesAreRefused() {
        assertFalse(WidgetAvatarRules.isFetchable("https://169.254.169.254/latest/meta-data", false));
        assertFalse(WidgetAvatarRules.isFetchable("https://192.168.1.1/a.jpg", true));
        assertFalse(WidgetAvatarRules.isFetchable("https://[::1]/a.jpg", true));
        assertFalse(WidgetAvatarRules.isFetchable("http://127.0.0.1/a.jpg", true));
    }

    @Test
    public void otherSchemesAndGarbageAreRefused() {
        assertFalse(WidgetAvatarRules.isFetchable("file:///data/data/me.meeshy.app/x", true));
        assertFalse(WidgetAvatarRules.isFetchable("content://x", true));
        assertFalse(WidgetAvatarRules.isFetchable("::", true));
        assertFalse(WidgetAvatarRules.isFetchable(null, true));
    }

    @Test
    public void aRedirectIsFollowedOnlyToAnotherMeeshyMediaHost() {
        assertEquals("https://static.meeshy.me/b.jpg",
            WidgetAvatarRules.redirectTarget("https://gate.meeshy.me/a.jpg", "https://static.meeshy.me/b.jpg", false));
        assertEquals("https://gate.meeshy.me/c/b.jpg",
            WidgetAvatarRules.redirectTarget("https://gate.meeshy.me/c/a.jpg", "b.jpg", false));
        assertNull(WidgetAvatarRules.redirectTarget("https://gate.meeshy.me/a.jpg", "https://evil.example/b.jpg", false));
        assertNull(WidgetAvatarRules.redirectTarget("https://gate.meeshy.me/a.jpg", "http://static.meeshy.me/b.jpg", false));
        assertNull(WidgetAvatarRules.redirectTarget("https://gate.meeshy.me/a.jpg", "https://10.0.0.1/b.jpg", false));
        assertNull(WidgetAvatarRules.redirectTarget("https://gate.meeshy.me/a.jpg", null, false));
        assertEquals(2, WidgetAvatarRules.MAX_REDIRECTS);
    }

    @Test
    public void aDeclaredBodyBeyondTheCapIsRefusedBeforeReading() {
        assertTrue(WidgetAvatarRules.acceptsLength(-1));
        assertTrue(WidgetAvatarRules.acceptsLength(WidgetAvatarRules.MAX_BYTES));
        assertFalse(WidgetAvatarRules.acceptsLength(WidgetAvatarRules.MAX_BYTES + 1));
    }

    @Test
    public void hugeDimensionsAreRefusedBeforeDecoding() {
        assertTrue(WidgetAvatarRules.acceptsDimensions(640, 640));
        assertTrue(WidgetAvatarRules.acceptsDimensions(4000, 4000));
        assertTrue(WidgetAvatarRules.acceptsDimensions(4096, 1000));
        assertFalse(WidgetAvatarRules.acceptsDimensions(4097, 10));
        assertFalse(WidgetAvatarRules.acceptsDimensions(10, 50_000));
        assertFalse(WidgetAvatarRules.acceptsDimensions(4096, 4096));
        assertFalse(WidgetAvatarRules.acceptsDimensions(0, 100));
        assertFalse(WidgetAvatarRules.acceptsDimensions(-1, -1));
    }

    @Test
    public void theSampleIsComputedOnTheLargestSideSoTheDecodeStaysNearTwiceTheTarget() {
        assertEquals(1, WidgetAvatarRules.sampleSize(200, 200, 120));
        assertEquals(2, WidgetAvatarRules.sampleSize(400, 100, 120));
        assertEquals(32, WidgetAvatarRules.sampleSize(4000, 100, 120));
        assertTrue(4000 / WidgetAvatarRules.sampleSize(4000, 100, 120) <= 2 * 120);
        assertTrue(3000 / WidgetAvatarRules.sampleSize(3000, 2000, 120) <= 2 * 120);
    }
}
