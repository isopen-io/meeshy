package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Port de `ContentPlaybackSessionLawTests` (iOS, #11039) : un son Meeshy met la musique des
 * autres applications en PAUSE, et un média muet n'y touche pas.
 */
class ContentPlaybackSessionLawTest {

    // MARK: - Audibilité

    @Test
    fun `un lecteur au volume plein et non coupe est audible`() {
        val audibility = ContentPlaybackAudibility.of(PlayerOutputState(isMuted = false, volume = 1f))

        assertThat(audibility).isEqualTo(ContentPlaybackAudibility.Audible)
    }

    @Test
    fun `un volume minuscule mais positif reste audible`() {
        val audibility = ContentPlaybackAudibility.of(PlayerOutputState(isMuted = false, volume = 0.01f))

        assertThat(audibility).isEqualTo(ContentPlaybackAudibility.Audible)
    }

    @Test
    fun `un lecteur coupe est muet meme a volume plein`() {
        val audibility = ContentPlaybackAudibility.of(PlayerOutputState(isMuted = true, volume = 1f))

        assertThat(audibility).isEqualTo(ContentPlaybackAudibility.Muted)
    }

    @Test
    fun `un lecteur a volume nul est muet`() {
        val audibility = ContentPlaybackAudibility.of(PlayerOutputState(isMuted = false, volume = 0f))

        assertThat(audibility).isEqualTo(ContentPlaybackAudibility.Muted)
    }

    @Test
    fun `un volume negatif ou indefini ne s'entend pas`() {
        assertThat(ContentPlaybackAudibility.of(PlayerOutputState(isMuted = false, volume = -0.5f)))
            .isEqualTo(ContentPlaybackAudibility.Muted)
        assertThat(ContentPlaybackAudibility.of(PlayerOutputState(isMuted = false, volume = Float.NaN)))
            .isEqualTo(ContentPlaybackAudibility.Muted)
    }

    @Test
    fun `l'absence de lecteur est muette`() {
        assertThat(ContentPlaybackAudibility.of(null)).isEqualTo(ContentPlaybackAudibility.Muted)
    }

    // MARK: - Directive

    @Test
    fun `un contenu audible active une lecture non melangeable`() {
        val directive = ContentPlaybackSessionLaw.directive(
            audibility = ContentPlaybackAudibility.Audible,
            audibleContentHoldsSession = false,
        )

        assertThat(directive).isEqualTo(ContentPlaybackSessionDirective.ActivatePlayback)
        assertThat(ContentPlaybackSessionLaw.AUDIBLE_MIXING).isEqualTo(SessionMixing.NonMixable)
        assertThat(directive.category).isEqualTo(SessionCategory.Playback)
    }

    @Test
    fun `un contenu audible active meme quand un autre son Meeshy tient deja la session`() {
        val directive = ContentPlaybackSessionLaw.directive(
            audibility = ContentPlaybackAudibility.Audible,
            audibleContentHoldsSession = true,
        )

        assertThat(directive).isEqualTo(ContentPlaybackSessionDirective.ActivatePlayback)
    }

    @Test
    fun `une video muette laisse la musique des autres applications tranquille`() {
        val directive = ContentPlaybackSessionLaw.directive(
            audibility = ContentPlaybackAudibility.Muted,
            audibleContentHoldsSession = false,
        )

        assertThat(directive).isEqualTo(ContentPlaybackSessionDirective.ConfigureAmbientWithoutActivating)
        assertThat(directive.category).isEqualTo(SessionCategory.Ambient)
    }

    @Test
    fun `une video muette ne retrograde pas un son Meeshy deja en cours`() {
        val directive = ContentPlaybackSessionLaw.directive(
            audibility = ContentPlaybackAudibility.Muted,
            audibleContentHoldsSession = true,
        )

        assertThat(directive).isEqualTo(ContentPlaybackSessionDirective.LeaveSessionAlone)
        assertThat(directive.category).isNull()
    }

    @Test
    fun `lever le son d'une video muette est lancer un son`() {
        val muted = ContentPlaybackSessionLaw.directive(ContentPlaybackAudibility.Muted, false)
        val unmuted = ContentPlaybackSessionLaw.directive(
            audibility = ContentPlaybackAudibility.of(PlayerOutputState(isMuted = false, volume = 1f)),
            audibleContentHoldsSession = false,
        )

        assertThat(muted).isEqualTo(ContentPlaybackSessionDirective.ConfigureAmbientWithoutActivating)
        assertThat(unmuted).isEqualTo(ContentPlaybackSessionDirective.ActivatePlayback)
    }

    @Test
    fun `aucune combinaison ne rend un media muet capable de prendre le focus`() {
        val grabbing = listOf(true, false).map { holds ->
            ContentPlaybackSessionLaw.directive(ContentPlaybackAudibility.Muted, holds)
        }

        assertThat(grabbing).doesNotContain(ContentPlaybackSessionDirective.ActivatePlayback)
    }

    @Test
    fun `une pause de l'utilisateur rend la session au bout de trois secondes`() {
        assertThat(ContentPlaybackSessionLaw.USER_PAUSE_RELEASE_DELAY_MILLIS).isEqualTo(3_000L)
    }
}
