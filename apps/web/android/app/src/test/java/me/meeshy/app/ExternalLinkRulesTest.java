package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;

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

    @Test
    public void beforeAndroid11AnAppThatIsNotABrowserTakesTheLink() {
        assertEquals("com.google.android.youtube", ExternalLinkRules.specializedHandler(
            Arrays.asList("com.android.chrome", "com.google.android.youtube"),
            new HashSet<>(Arrays.asList("com.android.chrome", "org.mozilla.firefox"))));
    }

    @Test
    public void beforeAndroid11OnlyBrowsersLeaveTheLinkToTheCustomTab() {
        assertNull(ExternalLinkRules.specializedHandler(
            Arrays.asList("com.android.chrome", "org.mozilla.firefox"),
            new HashSet<>(Arrays.asList("com.android.chrome", "org.mozilla.firefox"))));
        assertNull(ExternalLinkRules.specializedHandler(Collections.<String>emptyList(), Collections.<String>emptySet()));
    }
}
