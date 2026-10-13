package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/** Les liens que la coque ouvre hors de la WebView, au-dessus de Meeshy (#9858). */
public class ExternalLinkRulesTest {

    private static final String APP = "localhost";

    @Test
    public void aWebLinkToAnotherHostOpensOutside() {
        assertTrue(ExternalLinkRules.opensOutside("https", "example.com", APP));
        assertTrue(ExternalLinkRules.opensOutside("http", "example.com", APP));
        assertTrue(ExternalLinkRules.opensOutside("HTTPS", "www.youtube.com", APP));
    }

    @Test
    public void theAppOriginStaysInTheWebView() {
        assertFalse(ExternalLinkRules.opensOutside("https", "localhost", APP));
        assertFalse(ExternalLinkRules.opensOutside("https", "LOCALHOST", APP));
    }

    @Test
    public void otherSchemesKeepTheCapacitorPolicy() {
        assertFalse(ExternalLinkRules.opensOutside("mailto", null, APP));
        assertFalse(ExternalLinkRules.opensOutside("tel", null, APP));
        assertFalse(ExternalLinkRules.opensOutside("data", null, APP));
        assertFalse(ExternalLinkRules.opensOutside("blob", "localhost", APP));
        assertFalse(ExternalLinkRules.opensOutside("intent", "example.com", APP));
    }

    @Test
    public void anUnreadableLinkKeepsTheCapacitorPolicy() {
        assertFalse(ExternalLinkRules.opensOutside(null, "example.com", APP));
        assertFalse(ExternalLinkRules.opensOutside("https", null, APP));
        assertFalse(ExternalLinkRules.opensOutside("https", "", APP));
    }

    private static final List<String> BROWSERS = Arrays.asList("com.android.chrome", "org.mozilla.firefox");

    @Test
    public void beforeAndroid11AnAppThatHandlesTheLinkWithoutBeingABrowserOpensIt() {
        List<String> handlers = Arrays.asList("com.android.chrome", "com.google.android.youtube", "org.mozilla.firefox");
        assertEquals("com.google.android.youtube", ExternalLinkRules.specializedHandler(handlers, BROWSERS));
    }

    @Test
    public void beforeAndroid11TheFirstSpecializedAppInResolutionOrderWins() {
        List<String> handlers = Arrays.asList("com.google.android.apps.maps", "com.waze", "com.android.chrome");
        assertEquals("com.google.android.apps.maps", ExternalLinkRules.specializedHandler(handlers, BROWSERS));
    }

    @Test
    public void beforeAndroid11OnlyBrowsersHandlingTheLinkLeavesItToTheCustomTab() {
        assertNull(ExternalLinkRules.specializedHandler(BROWSERS, BROWSERS));
        assertNull(ExternalLinkRules.specializedHandler(Collections.<String>emptyList(), BROWSERS));
    }

    @Test
    public void beforeAndroid11AnUnreadablePackageListLeavesItToTheCustomTab() {
        assertNull(ExternalLinkRules.specializedHandler(null, BROWSERS));
        assertNull(ExternalLinkRules.specializedHandler(Arrays.asList(null, ""), BROWSERS));
        assertEquals("com.spotify.music", ExternalLinkRules.specializedHandler(Arrays.asList("com.spotify.music"), null));
    }
}
