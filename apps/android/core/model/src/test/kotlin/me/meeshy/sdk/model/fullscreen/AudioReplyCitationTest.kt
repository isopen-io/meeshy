package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioReplyCitationTest {

    @Test
    fun `la citation nomme l'auteur et donne la duree au format horloge`() {
        val citation = AudioReplyCitation.of(authorName = "Awa", durationMs = 72_000L)

        assertThat(citation.author).isEqualTo("Awa")
        assertThat(citation.durationLabel).isEqualTo("1:12")
    }

    @Test
    fun `la duree arrondit vers le bas a la seconde`() {
        assertThat(AudioReplyCitation.of("Awa", 9_999L).durationLabel).isEqualTo("0:09")
    }

    @Test
    fun `sans duree connue la citation n'invente pas de 0 colon 00`() {
        assertThat(AudioReplyCitation.of("Awa", 0L).durationLabel).isNull()
        assertThat(AudioReplyCitation.of("Awa", -5L).durationLabel).isNull()
    }

    @Test
    fun `un nom absent ou fait d'espaces donne un auteur vide, pas un null`() {
        assertThat(AudioReplyCitation.of(null, 1_000L).author).isEmpty()
        assertThat(AudioReplyCitation.of("   ", 1_000L).author).isEmpty()
        assertThat(AudioReplyCitation.of("  Awa ", 1_000L).author).isEqualTo("Awa")
    }
}
