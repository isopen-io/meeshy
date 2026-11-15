package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * A1.18 — « Voir l'original » ne fait que fondre : les deux états d'une phrase traduite se SUPERPOSENT, la phrase garde
 * la hauteur du plus haut, et aucune phrase ne glisse. Mêmes vecteurs qu'iOS `CallJournalAfterCall.layers(for:showsOriginal:)`
 * (`BubbleCallJournalUnderCardTests`). L'inversion de #17862 (A) reste celle de [CallTranscriptLine.text] et
 * [CallTranscriptLine.secondary].
 */
class CallTranscriptLayersTest {

    private fun line(
        original: String = "Nos vemos mañana",
        translated: String? = "On se voit demain",
        isLocal: Boolean = false,
        captureKind: CallCaptureKind? = null,
    ) = CallTranscriptLine(
        speakerName = "Zoé",
        isLocal = isLocal,
        elapsedLabel = "00:05",
        original = original,
        translated = translated,
        translatedLanguage = translated?.let { "fr" },
        speakerId = "peer",
        captureKind = captureKind,
    )

    private fun CallTranscriptLine.stateOf(showOriginal: Boolean) = CallTranscriptLayer(
        text = text(showOriginal),
        showsTranslation = showsTranslation(showOriginal),
        secondary = secondary(showOriginal),
        isShown = true,
    )

    @Test
    fun `a translated sentence lays out both states, in the same order whatever the switch`() {
        val sentence = line()

        listOf(false, true).forEach { showOriginal ->
            val layers = sentence.layers(showOriginal)
            assertThat(layers.map { it.copy(isShown = true) })
                .containsExactly(sentence.stateOf(showOriginal = false), sentence.stateOf(showOriginal = true))
                .inOrder()
        }
    }

    @Test
    fun `only the state the switch asks for is shown, the other keeps the height invisibly`() {
        val sentence = line()

        listOf(false, true).forEach { showOriginal ->
            val shown = sentence.layers(showOriginal).filter { it.isShown }
            assertThat(shown).containsExactly(sentence.stateOf(showOriginal))
        }
    }

    @Test
    fun `the inversion of 17862 is untouched - translation leads by default, the original leads once asked`() {
        val sentence = line()

        val byDefault = sentence.layers(showOriginal = false).single { it.isShown }
        assertThat(byDefault.text).isEqualTo("On se voit demain")
        assertThat(byDefault.showsTranslation).isTrue()
        assertThat(byDefault.secondary).isEqualTo(CallTranscriptSecondary(CallTranscriptSecondaryKind.ORIGINAL, "Nos vemos mañana"))

        val inverted = sentence.layers(showOriginal = true).single { it.isShown }
        assertThat(inverted.text).isEqualTo("Nos vemos mañana")
        assertThat(inverted.showsTranslation).isFalse()
        assertThat(inverted.secondary).isEqualTo(CallTranscriptSecondary(CallTranscriptSecondaryKind.TRANSLATED, "On se voit demain"))
    }

    @Test
    fun `an untranslated sentence is a single shown layer in both states`() {
        val sentence = line(original = "Hi!", translated = null)

        listOf(false, true).forEach { showOriginal ->
            assertThat(sentence.layers(showOriginal))
                .containsExactly(CallTranscriptLayer(text = "Hi!", showsTranslation = false, secondary = null, isShown = true))
        }
    }

    @Test
    fun `my own sentence, a blank translation and a capture are a single shown layer`() {
        val singles = listOf(
            line(isLocal = true),
            line(translated = "  "),
            line(original = "", translated = null, captureKind = CallCaptureKind.SCREENSHOT),
        )

        singles.forEach { sentence ->
            listOf(false, true).forEach { showOriginal ->
                val layers = sentence.layers(showOriginal)
                assertThat(layers).hasSize(1)
                assertThat(layers.single().isShown).isTrue()
                assertThat(layers.single().showsTranslation).isFalse()
                assertThat(layers.single().secondary).isNull()
            }
        }
    }
}
