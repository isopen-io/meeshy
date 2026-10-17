package me.meeshy.app.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Seul le lien du mail (`https://meeshy.me/auth/magic-link?token=...`, App Link
 * verifie) mene a l'ecran de validation. Le scheme custom `meeshy://` s'ouvre
 * depuis n'importe quelle page ou app : un jeton d'e-mail recu par lui
 * connecterait la victime au compte de l'attaquant (#10873).
 */
class MagicLinkDeepLinkTest {

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
            LaunchRouter.routeForDeepLink("https://meeshy.me/auth/magic-link?token=a%2Bb%3D"),
        )
    }

    @Test
    fun `an email-token link received through the custom scheme yields no route`() {
        assertNull(LaunchRouter.routeForDeepLink("meeshy://auth/magic-link?token=abc123"))
        assertNull(LaunchRouter.routeForDeepLink("meeshy://auth/magic-link?token=a%2Bb%3D"))
        assertNull(LaunchRouter.routeForDeepLink("meeshy://auth/email-link?token=abc123"))
        assertNull(LaunchRouter.routeForDeepLink("meeshy://auth/verify-email?token=abc123"))
        assertNull(LaunchRouter.routeForDeepLink("meeshy://auth/reset-password?token=abc123"))
        assertNull(LaunchRouter.routeForDeepLink("MEESHY://auth/magic-link?token=abc123"))
    }

    @Test
    fun `unrelated links and missing tokens yield no route`() {
        assertNull(LaunchRouter.routeForDeepLink(null))
        assertNull(LaunchRouter.routeForDeepLink("meeshy://chat/abc"))
        assertNull(LaunchRouter.routeForDeepLink("https://meeshy.me/story/xyz"))
        assertNull(LaunchRouter.routeForDeepLink("https://meeshy.me/auth/magic-link"))
        assertNull(LaunchRouter.routeForDeepLink("https://meeshy.me/auth/magic-link?token="))
        assertNull(LaunchRouter.routeForDeepLink("https://evil.example/auth/magic-link?token=abc"))
    }
}
