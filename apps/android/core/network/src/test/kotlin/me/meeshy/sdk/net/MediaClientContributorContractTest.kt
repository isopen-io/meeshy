package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaClientDerivation
import org.junit.Test

/**
 * #14567 — le client des médias garde ses contributeurs PAR NOM ([MediaClientDerivation]). Renommer l'un d'eux ici
 * retirerait en silence l'épinglage ou la frontière de session des médias : ce témoin rougit avant.
 */
class MediaClientContributorContractTest {

    @Test
    fun `les contributeurs que le client des medias garde existent sous ces noms dans le client partage`() {
        val shared = builtInContributors(MeeshyConfig(enableLogging = false), InMemoryTokenStore(), {}, SessionRefresher(InMemoryTokenStore()) { null })
            .map { it.id } + CertificatePinnerContributor.of().id

        assertThat(MediaClientDerivation.kept(shared))
            .containsExactly(MediaClientDerivation.SESSION_BOUNDARY, MediaClientDerivation.PINNING)
    }
}
