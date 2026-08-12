package me.meeshy.app.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Le lien du mail (`https://meeshy.me/auth/magic-link?token=...`) et son alias
 * de scheme custom (`meeshy://auth/magic-link?token=...`) doivent tous deux
 * mener a l'ecran de validation — et RIEN d'autre ne doit matcher.
 */
class MagicLinkDeepLinkTest {

    @Test
    fun `the custom scheme magic link routes to validation with its token`() {
        assertEquals(
            "auth/magic-link?token=abc123",
            LaunchRouter.routeForDeepLink("meeshy://auth/magic-link?token=abc123"),
        )
    }

    @Test
    fun `the https email link routes to validation with its token`() {
        assertEquals(
            "auth/magic-link?token=abc123",
            LaunchRouter.routeForDeepLink("https://meeshy.me/auth/magic-link?token=abc123"),
        )
    }

    // Le token voyage URL-encode dans le mail : il doit rester ENCODE dans la
    // route nav (l'argument nav le decode une seule fois a l'arrivee).
    @Test
    fun `an url-encoded token is preserved verbatim in the route`() {
        assertEquals(
            "auth/magic-link?token=a%2Bb%3D",
            LaunchRouter.routeForDeepLink("meeshy://auth/magic-link?token=a%2Bb%3D"),
        )
    }

    @Test
    fun `unrelated links and missing tokens yield no route`() {
        assertNull(LaunchRouter.routeForDeepLink(null))
        assertNull(LaunchRouter.routeForDeepLink("meeshy://chat/abc"))
        assertNull(LaunchRouter.routeForDeepLink("https://meeshy.me/story/xyz"))
        assertNull(LaunchRouter.routeForDeepLink("meeshy://auth/magic-link"))
        assertNull(LaunchRouter.routeForDeepLink("meeshy://auth/magic-link?token="))
        assertNull(LaunchRouter.routeForDeepLink("https://evil.example/auth/magic-link?token=abc"))
    }
}
