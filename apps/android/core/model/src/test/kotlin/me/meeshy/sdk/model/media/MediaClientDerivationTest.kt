package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le client HTTP des médias (#14567) part du pool du client partagé, mais ne garde de ses contributeurs que ce qui
 * protège la connexion et la frontière du compte : un intercepteur d'API (jeton, garde d'URL, relance) monté là
 * ferait partir l'identité du lecteur vers l'hôte qu'une `mediaURL` désigne.
 */
class MediaClientDerivationTest {

    private val sharedClientContributors = listOf(
        "session-boundary",
        "upload-timeouts",
        "upgrade-required",
        "url-guard",
        "endpoint-policy",
        "email-verification-gate",
        "retry",
        "proactive-refresh",
        "auth",
        "client-info",
        "client-capabilities",
        "device-locale",
        "auth-expiry",
        "guest-session-end",
        "refresh-authenticator",
        "slow-request",
        "logging",
        "certificate-pinning",
    )

    @Test
    fun `le client des medias garde l epinglage et la frontiere de session, rien d autre`() {
        assertThat(MediaClientDerivation.kept(sharedClientContributors))
            .containsExactly(MediaClientDerivation.SESSION_BOUNDARY, MediaClientDerivation.PINNING)
    }

    @Test
    fun `ni le jeton ni la garde d URL de l API ne montent sur le client des medias`() {
        val kept = MediaClientDerivation.kept(sharedClientContributors)
        assertThat(kept).containsNoneOf("auth", "url-guard", "refresh-authenticator", "proactive-refresh", "auth-expiry", "logging")
    }

    @Test
    fun `aucun contributeur ne donne aucun contributeur`() {
        assertThat(MediaClientDerivation.kept(emptyList())).isEmpty()
    }

    @Test
    fun `un role inconnu est refuse, meme a une casse pres d un role garde`() {
        assertThat(MediaClientDerivation.kept(listOf("media-auth", "Session-Boundary", "CERTIFICATE-PINNING", ""))).isEmpty()
    }

    @Test
    fun `un role garde contribue une seule fois`() {
        assertThat(MediaClientDerivation.kept(listOf("certificate-pinning", "certificate-pinning")))
            .containsExactly(MediaClientDerivation.PINNING)
    }
}
