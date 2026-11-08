package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import org.junit.Test

class CallCaptionAccessibilityTest {
    private fun line(isFinal: Boolean = true, isLocal: Boolean = false) = CallLiveCaptionLine(
        key = "k", speakerId = "peer", speakerName = "Ada", isLocal = isLocal, text = "Bonjour",
        languageTag = "EN → FR", isFinal = isFinal, capturedAtMs = 0, isShowingOriginal = false, canRevealOriginal = true,
    )

    @Test
    fun `a final sentence of a peer is read and announced`() {
        val semantics = CallCaptionAccessibility.of(line())

        assertThat(semantics.isHidden).isFalse()
        assertThat(semantics.announces).isTrue()
        assertThat(semantics.label).isEqualTo("Ada : Bonjour")
    }

    @Test
    fun `a partial revision is hidden from TalkBack and never announced`() {
        val semantics = CallCaptionAccessibility.of(line(isFinal = false))

        assertThat(semantics.isHidden).isTrue()
        assertThat(semantics.announces).isFalse()
    }

    @Test
    fun `my own final words are read but never announced`() {
        val semantics = CallCaptionAccessibility.of(line(isLocal = true))

        assertThat(semantics.isHidden).isFalse()
        assertThat(semantics.announces).isFalse()
    }
}
