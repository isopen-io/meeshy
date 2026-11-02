package me.meeshy.sdk.model.speech

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OnDeviceTranscriptionTest {

    private fun segment(text: String, startMs: Long, durationMs: Long, confidence: Double = 0.8) =
        OnDeviceTranscriptionSegment(text, startMs, durationMs, confidence)

    @Test
    fun `le débit se mesure en mots par minute sur l'étendue parlée`() {
        val segments = listOf(segment("bonjour tout le", 0, 1_000), segment("monde ici", 1_000, 1_000))
        assertThat(OnDeviceTranscription.speakingRate(segments)).isWithin(1e-9).of(150.0)
    }

    @Test
    fun `sans segment ou sans durée le débit est indéterminé`() {
        assertThat(OnDeviceTranscription.speakingRate(emptyList())).isNull()
        assertThat(OnDeviceTranscription.speakingRate(listOf(segment("salut", 500, 0)))).isNull()
    }

    @Test
    fun `la confiance globale est la moyenne des segments et zéro sans segment`() {
        val segments = listOf(segment("a", 0, 10, 0.5), segment("b", 10, 10, 1.0))
        assertThat(OnDeviceTranscription.averageConfidence(segments)).isWithin(1e-9).of(0.75)
        assertThat(OnDeviceTranscription.averageConfidence(emptyList())).isEqualTo(0.0)
    }

    @Test
    fun `un texte reconnu devient un segment qui couvre la durée de l'audio`() {
        val result = OnDeviceTranscription.fromRecognition("  un deux trois quatre ", "fr-FR", 0.9, 2_000)
        assertThat(result.text).isEqualTo("un deux trois quatre")
        assertThat(result.language).isEqualTo("fr-FR")
        assertThat(result.segments).containsExactly(segment("un deux trois quatre", 0, 2_000, 0.9))
        assertThat(result.speakingRate).isWithin(1e-9).of(120.0)
    }

    @Test
    fun `une durée inconnue ne fabrique ni segment ni débit`() {
        val result = OnDeviceTranscription.fromRecognition("salut", "fr", 0.7, null)
        assertThat(result.segments).isEmpty()
        assertThat(result.speakingRate).isNull()
        assertThat(result.confidence).isEqualTo(0.7)
    }

    @Test
    fun `un texte vide a une confiance nulle`() {
        val result = OnDeviceTranscription.fromRecognition("  ", "fr", 0.9, 1_000)
        assertThat(result.text).isEmpty()
        assertThat(result.confidence).isEqualTo(0.0)
        assertThat(result.segments).isEmpty()
    }
}
