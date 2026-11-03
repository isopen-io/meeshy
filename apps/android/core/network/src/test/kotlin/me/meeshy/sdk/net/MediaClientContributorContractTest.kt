package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaClientRole
import org.junit.Test

/**
 * #14567, #14613 — le client des médias garde ses contributeurs par le RÔLE qu'ils portent ([mediaRole]), que seul ce
 * module émet. Retirer le jeton de l'épinglage ou de la frontière de session les
 * ferait tomber en silence du client des médias ; en poser un ailleurs y monterait un intercepteur d'API : ce témoin
 * rougit dans les deux cas.
 */
class MediaClientContributorContractTest {

    @Test
    fun `seuls l epinglage et la frontiere de session du client partage portent un role sur le client des medias`() {
        val shared = builtInContributors(MeeshyConfig(enableLogging = false), InMemoryTokenStore(), {}, SessionRefresher(InMemoryTokenStore()) { null }) +
            CertificatePinnerContributor.of()

        val granted = shared.filter { it.mediaRole() != null }

        assertThat(granted.map { it.id }).containsExactly("session-boundary", CertificatePinnerContributor.ID)
        assertThat(granted.map { it.mediaRole() })
            .containsExactly(MediaClientRole.SESSION_BOUNDARY, MediaClientRole.CERTIFICATE_PINNING)
    }
}
