package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** L'ecran ouvert, retrouve quand Android recree la coque (#10034). */
public class ShellRouteTest {

    private static final String APP = "https://localhost";

    @Test
    public void anOpenScreenBecomesTheShortLinkTheRouterAlreadyReads() {
        assertEquals("meeshy://c/abc", ShellRoute.restoreLink("https://localhost/c/abc", APP));
        assertEquals("meeshy://me", ShellRoute.restoreLink("https://localhost/me", APP));
    }

    @Test
    public void theQueryAndTheFragmentComeBackToo() {
        assertEquals("meeshy://c/abc?m=1#x", ShellRoute.restoreLink("https://localhost/c/abc?m=1#x", APP));
    }

    @Test
    public void theStartScreenNeedsNothing() {
        assertNull(ShellRoute.restoreLink("https://localhost/", APP));
        assertNull(ShellRoute.restoreLink("https://localhost", APP));
    }

    @Test
    public void onlyTheAppOriginIsRestored() {
        assertNull(ShellRoute.restoreLink("https://example.com/c/abc", APP));
        assertNull(ShellRoute.restoreLink("http://localhost/c/abc", APP));
        assertNull(ShellRoute.restoreLink("about:blank", APP));
    }

    @Test
    public void anUnreadableAddressRestoresNothing() {
        assertNull(ShellRoute.restoreLink(null, APP));
        assertNull(ShellRoute.restoreLink("https://localhost/c/a b", APP));
        assertNull(ShellRoute.restoreLink("https://localhost/c/abc", null));
    }
}
