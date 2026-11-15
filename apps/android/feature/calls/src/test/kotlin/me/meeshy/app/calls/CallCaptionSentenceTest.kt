package me.meeshy.app.calls

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import org.junit.Test

class CallCaptionSentenceTest {
    private fun line(tag: String?, text: String = "Bonjour", name: String = "Moi") = CallLiveCaptionLine(
        key = "k", speakerId = "peer", speakerName = name, isLocal = false, text = text, languageTag = tag,
        isFinal = true, capturedAtMs = 0, isShowingOriginal = false, canRevealOriginal = true,
    )

    @Test
    fun `the name, the text and the label are one sentence`() {
        val sentence = CallCaptionSentence.text(line("EN → FR"), Color.Red, Color.White, dotAlphas = null)

        assertThat(sentence.text).isEqualTo("Moi · Bonjour  EN → FR ")
    }

    @Test
    fun `no label, no dots, nothing after the text`() {
        val sentence = CallCaptionSentence.text(line(null), Color.Red, Color.White, dotAlphas = null)

        assertThat(sentence.text).isEqualTo("Moi · Bonjour")
    }

    @Test
    fun `the awaited translation adds three dots after the label`() {
        val sentence = CallCaptionSentence.text(line("EN", text = "Hello"), Color.Red, Color.White, CallCaptionSentence.dotAlphas(phase = null))

        assertThat(sentence.text).isEqualTo("Moi · Hello  EN  • • •")
    }

    @Test
    fun `still, the three dots share one alpha, moving the lit one travels`() {
        assertThat(CallCaptionSentence.dotAlphas(phase = null).distinct()).hasSize(1)
        assertThat(CallCaptionSentence.dotAlphas(phase = 1)).containsExactly(0.35f, 0.9f, 0.35f).inOrder()
    }
}
