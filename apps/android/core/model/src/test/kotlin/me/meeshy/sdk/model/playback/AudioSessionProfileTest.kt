package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Port de `AudioSessionProfileTests` (iOS, #11039) : les deux profils posent la MEME session non
 * melangeable ; seule la carte « A l'ecoute » les distingue.
 */
class AudioSessionProfileTest {

    @Test
    fun `le profil de contenu n'est pas melangeable`() {
        assertThat(AudioSessionProfile.Content.mixing).isEqualTo(SessionMixing.NonMixable)
    }

    @Test
    fun `le profil transitoire met la musique des autres applications en pause comme le contenu`() {
        assertThat(AudioSessionProfile.Transient.mixing).isEqualTo(ContentPlaybackSessionLaw.AUDIBLE_MIXING)
    }

    @Test
    fun `aucun profil ne melange ni ne baisse les autres applications`() {
        AudioSessionProfile.entries.forEach { profile ->
            assertThat(profile.mixing).isEqualTo(SessionMixing.NonMixable)
        }
    }

    @Test
    fun `seul le moteur de contenu publie la carte a l'ecoute`() {
        assertThat(AudioSessionProfile.Content.publishesListeningCard).isTrue()
        assertThat(AudioSessionProfile.Transient.publishesListeningCard).isFalse()
    }
}
