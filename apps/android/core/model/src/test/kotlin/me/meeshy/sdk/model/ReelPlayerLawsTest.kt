package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReelPlayerLawsTest {

    @Test
    fun `un toucher sur le contenu chrome efface rend le chrome et ne touche pas la lecture`() {
        assertThat(ReelContentTap.outcome(chromeHidden = true, hasPlayableMedia = true))
            .isEqualTo(ReelContentTap.Outcome.RESTORE_CHROME)
    }

    @Test
    fun `un toucher sur un reel jouable bascule lecture et pause`() {
        assertThat(ReelContentTap.outcome(chromeHidden = false, hasPlayableMedia = true))
            .isEqualTo(ReelContentTap.Outcome.TOGGLE_PLAYBACK)
    }

    @Test
    fun `un toucher sur un reel sans piste ne fait rien`() {
        assertThat(ReelContentTap.outcome(chromeHidden = false, hasPlayableMedia = false))
            .isEqualTo(ReelContentTap.Outcome.NONE)
    }

    @Test
    fun `la fraction de la barre reste dans l intervalle et ignore une largeur nulle`() {
        assertThat(ReelScrub.fraction(x = 50f, width = 200f)).isEqualTo(0.25f)
        assertThat(ReelScrub.fraction(x = -10f, width = 200f)).isEqualTo(0f)
        assertThat(ReelScrub.fraction(x = 999f, width = 200f)).isEqualTo(1f)
        assertThat(ReelScrub.fraction(x = 50f, width = 0f)).isEqualTo(0f)
    }

    @Test
    fun `la position de saut suit la fraction et reste nulle sans duree`() {
        assertThat(ReelScrub.seekMs(fraction = 0.5f, durationMs = 20_000)).isEqualTo(10_000L)
        assertThat(ReelScrub.seekMs(fraction = 0.5f, durationMs = 0)).isNull()
        assertThat(ReelScrub.seekMs(fraction = 2f, durationMs = 1_000)).isEqualTo(1_000L)
    }

    @Test
    fun `la progression est bornee et nulle sans duree connue`() {
        assertThat(ReelScrub.progress(positionMs = 5_000, durationMs = 20_000)).isEqualTo(0.25f)
        assertThat(ReelScrub.progress(positionMs = 30_000, durationMs = 20_000)).isEqualTo(1f)
        assertThat(ReelScrub.progress(positionMs = 5_000, durationMs = -1)).isEqualTo(0f)
    }

    @Test
    fun `le menu d un reel d autrui propose ouvrir copier partager et signaler`() {
        assertThat(ReelMenu.actions(isOwn = false, hasText = true))
            .containsExactly(
                ReelMenu.Action.OPEN, ReelMenu.Action.COPY_TEXT, ReelMenu.Action.SHARE, ReelMenu.Action.REPORT,
            ).inOrder()
    }

    @Test
    fun `le menu de son propre reel propose epingler et supprimer, jamais signaler`() {
        assertThat(ReelMenu.actions(isOwn = true, hasText = true))
            .containsExactly(
                ReelMenu.Action.OPEN, ReelMenu.Action.COPY_TEXT, ReelMenu.Action.SHARE,
                ReelMenu.Action.PIN, ReelMenu.Action.DELETE,
            ).inOrder()
    }

    @Test
    fun `sans texte il n y a rien a copier`() {
        assertThat(ReelMenu.actions(isOwn = false, hasText = false)).doesNotContain(ReelMenu.Action.COPY_TEXT)
    }

    @Test
    fun `les drapeaux de legende mettent l original en tete puis les traductions triees, quatre au plus`() {
        assertThat(ReelCaption.codes("fr", listOf("en", "es", "FR", "de", "it")))
            .containsExactly("fr", "de", "en", "es").inOrder()
        assertThat(ReelCaption.codes(null, emptyList())).isEmpty()
    }

    @Test
    fun `sans langue choisie la legende servie par le prisme reste`() {
        assertThat(ReelCaption.displayed(null, "fr", "Salut", mapOf("en" to "Hi"), served = "Hi")).isEqualTo("Hi")
    }

    @Test
    fun `choisir la langue d origine rend le texte d origine`() {
        assertThat(ReelCaption.displayed("FR", "fr", "Salut", mapOf("en" to "Hi"), served = "Hi")).isEqualTo("Salut")
    }

    @Test
    fun `choisir une traduction la rend et une langue sans texte retombe sur le servi`() {
        assertThat(ReelCaption.displayed("EN", "fr", "Salut", mapOf("en" to "Hi"), served = "Salut")).isEqualTo("Hi")
        assertThat(ReelCaption.displayed("de", "fr", "Salut", mapOf("en" to "Hi"), served = "Salut")).isEqualTo("Salut")
    }

    @Test
    fun `rebasculer sur le meme drapeau efface le choix`() {
        assertThat(ReelCaption.toggled(current = "en", tapped = "EN")).isNull()
        assertThat(ReelCaption.toggled(current = null, tapped = "en")).isEqualTo("en")
        assertThat(ReelCaption.toggled(current = "fr", tapped = "en")).isEqualTo("en")
    }
}
