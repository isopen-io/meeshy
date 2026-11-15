package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AudioPlayerChrome
import me.meeshy.sdk.model.media.MediaPlayerContext
import org.junit.Test

class AudioLanguageStripLawTest {

    @Test
    fun `le bandeau se montre en carte et en posture focalisee hors contexte compact`() {
        assertThat(AudioLanguageStripLaw.isShown(AudioPlayerChrome.Card, MediaPlayerContext.FEED_POST, translatedCount = 1)).isTrue()
        assertThat(AudioLanguageStripLaw.isShown(AudioPlayerChrome.FlatFocused, MediaPlayerContext.FULLSCREEN, translatedCount = 2)).isTrue()
    }

    @Test
    fun `le bandeau est masque dans la bulle compacte`() {
        assertThat(AudioLanguageStripLaw.isShown(AudioPlayerChrome.Card, MediaPlayerContext.MESSAGE_BUBBLE, translatedCount = 3)).isFalse()
    }

    @Test
    fun `le bandeau est masque en posture minimale et sans piste traduite`() {
        assertThat(AudioLanguageStripLaw.isShown(AudioPlayerChrome.FlatMinimal, MediaPlayerContext.FEED_POST, translatedCount = 2)).isFalse()
        assertThat(AudioLanguageStripLaw.isShown(AudioPlayerChrome.Card, MediaPlayerContext.FEED_POST, translatedCount = 0)).isFalse()
    }

    @Test
    fun `la pastille Original ouvre le bandeau puis une pastille par piste, dedoublonnee et en minuscules`() {
        val pills = AudioLanguageStripLaw.pills(translated = listOf("FR", "es", "fr", " ", "ES"), selected = null)
        assertThat(pills.map { it.code }).containsExactly(AudioLanguageStripLaw.ORIGINAL, "fr", "es").inOrder()
        assertThat(pills.map { it.isSelected }).containsExactly(true, false, false).inOrder()
    }

    @Test
    fun `la pastille selectionnee suit la langue jouee, sans casse`() {
        val pills = AudioLanguageStripLaw.pills(translated = listOf("fr", "es"), selected = "ES")
        assertThat(pills.map { it.isSelected }).containsExactly(false, false, true).inOrder()
    }

    @Test
    fun `la sentinelle selectionne l'original`() {
        val pills = AudioLanguageStripLaw.pills(translated = listOf("fr"), selected = AudioLanguageStripLaw.ORIGINAL)
        assertThat(pills.first().isSelected).isTrue()
        assertThat(pills.last().isSelected).isFalse()
    }

    @Test
    fun `un toucher sur la sentinelle leve la bascule, une langue la pose`() {
        assertThat(AudioLanguageStripLaw.overrideFor(AudioLanguageStripLaw.ORIGINAL)).isNull()
        assertThat(AudioLanguageStripLaw.overrideFor("ES")).isEqualTo("es")
    }
}
