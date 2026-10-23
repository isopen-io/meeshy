package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryAudioTranscriptTest {
    private val fx = StoryEffects(
        voiceTranscriptions = listOf(
            StoryVoiceTranscription("de", "Hallo"),
            StoryVoiceTranscription("es", "Hola"),
        ),
        backgroundAudioVariants = listOf(StoryAudioVariant("pm-es", "es"), StoryAudioVariant("pm-en", "en-US")),
    )

    @Test fun `le rang 2 est servi quand le rang 1 manque`() =
        assertThat(StoryAudioTranscript.resolve(fx, listOf("fr", "es"))?.content).isEqualTo("Hola")

    @Test fun `sans correspondance la premiere entree est servie`() =
        assertThat(StoryAudioTranscript.resolve(fx, listOf("fr"))?.content).isEqualTo("Hallo")

    @Test fun `une transcription blanche est sautee`() {
        val e = StoryEffects(voiceTranscriptions = listOf(StoryVoiceTranscription("fr", "  "), StoryVoiceTranscription("en", "Hi")))
        assertThat(StoryAudioTranscript.resolve(e, listOf("fr", "en"))?.content).isEqualTo("Hi")
    }

    @Test fun `la variante audio suit la chaine sans repli arbitraire`() {
        assertThat(StoryAudioTranscript.variant(fx, listOf("fr", "en"))?.postMediaId).isEqualTo("pm-en")
        assertThat(StoryAudioTranscript.variant(fx, listOf("fr"))).isNull()
    }

    @Test fun `les langues disponibles unissent les deux gisements triees`() =
        assertThat(StoryAudioTranscript.availableLanguages(fx)).containsExactly("de", "en", "es").inOrder()

    @Test fun `hasTranscript exige du texte`() {
        assertThat(StoryAudioTranscript.hasTranscript(fx)).isTrue()
        assertThat(StoryAudioTranscript.hasTranscript(StoryEffects(voiceTranscriptions = listOf(StoryVoiceTranscription("fr", " "))))).isFalse()
        assertThat(StoryAudioTranscript.resolve(null, listOf("fr"))).isNull()
    }
}
