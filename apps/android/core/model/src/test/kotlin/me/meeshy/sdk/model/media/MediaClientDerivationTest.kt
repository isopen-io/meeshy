package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le client HTTP des médias (#14567) part du pool du client partagé, mais ne garde de ses contributeurs que ce qui
 * protège la connexion et la frontière du compte : un intercepteur d'API (jeton, garde d'URL, relance) monté là
 * ferait partir l'identité du lecteur vers l'hôte qu'une `mediaURL` désigne.
 *
 * #14613 — la liste blanche porte sur des RÔLES, plus sur des noms : un contributeur qui reprendrait le nom
 * « certificate-pinning » sans en tenir le rôle ne monte pas.
 */
class MediaClientDerivationTest {

    @Test
    fun `le client des medias garde l epinglage et la frontiere de session`() {
        assertThat(MediaClientRole.entries.filter(MediaClientDerivation::keeps))
            .containsExactly(MediaClientRole.CERTIFICATE_PINNING, MediaClientRole.SESSION_BOUNDARY)
    }

    @Test
    fun `un contributeur sans role ne monte pas sur le client des medias`() {
        assertThat(MediaClientDerivation.keeps(null)).isFalse()
    }
}
