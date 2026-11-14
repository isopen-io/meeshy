package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallTranscriptLine
import org.junit.Test

/** #17896 — what TalkBack reads of a journal row after the call: the leading line, then « Original : … » or « Traduit : … ». */
class CallTranscriptRowAccessibilityTest {
    private fun translated() = CallTranscriptLine(
        speakerName = "Zoé", isLocal = false, elapsedLabel = "0:12", original = "Nos vemos mañana",
        translated = "On se voit demain", translatedLanguage = "fr",
    )

    private fun label(line: CallTranscriptLine, showOriginal: Boolean) =
        CallTranscriptRowAccessibility.label(line, showOriginal, originalWord = "Original", translatedWord = "Traduit")

    @Test
    fun `by default the row reads the translation, then Original`() {
        assertThat(label(translated(), showOriginal = false))
            .isEqualTo("Zoé, 0:12 : On se voit demain. Original : Nos vemos mañana")
    }

    @Test
    fun `with the original shown the row reads the original, then Traduit`() {
        assertThat(label(translated(), showOriginal = true))
            .isEqualTo("Zoé, 0:12 : Nos vemos mañana. Traduit : On se voit demain")
    }

    @Test
    fun `a sentence without translation reads alone in both states`() {
        val line = translated().copy(translated = null, translatedLanguage = null)

        assertThat(label(line, showOriginal = false)).isEqualTo("Zoé, 0:12 : Nos vemos mañana")
        assertThat(label(line, showOriginal = true)).isEqualTo("Zoé, 0:12 : Nos vemos mañana")
    }
}
