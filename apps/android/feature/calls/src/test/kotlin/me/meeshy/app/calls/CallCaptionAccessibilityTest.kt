package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import org.junit.Test

class CallCaptionAccessibilityTest {
    private fun line(isFinal: Boolean = true, isLocal: Boolean = false, originalBelow: String? = null) = CallLiveCaptionLine(
        key = "k", speakerId = "peer", speakerName = "Ada", isLocal = isLocal, text = "Bonjour",
        languageTag = "EN → FR", isFinal = isFinal, capturedAtMs = 0, isShowingOriginal = false, canRevealOriginal = true,
        originalBelow = originalBelow,
    )

    @Test
    fun `a final sentence of a peer is read and announced`() {
        val semantics = CallCaptionAccessibility.of(line(), "Original", null)

        assertThat(semantics.isHidden).isFalse()
        assertThat(semantics.announces).isTrue()
        assertThat(semantics.label).isEqualTo("Ada : Bonjour")
    }

    @Test
    fun `a partial revision is hidden from TalkBack and never announced`() {
        val semantics = CallCaptionAccessibility.of(line(isFinal = false), "Original", null)

        assertThat(semantics.isHidden).isTrue()
        assertThat(semantics.announces).isFalse()
    }

    @Test
    fun `my own final words are read but never announced`() {
        val semantics = CallCaptionAccessibility.of(line(isLocal = true), "Original", null)

        assertThat(semantics.isHidden).isFalse()
        assertThat(semantics.announces).isFalse()
    }

    @Test
    fun `the unfolded original and the wait are read after the sentence`() {
        val semantics = CallCaptionAccessibility.of(line(originalBelow = "Hello"), "Original", "Translating")

        assertThat(semantics.label).isEqualTo("Ada : Bonjour. Original : Hello, Translating")
    }

    @Test
    fun `without an original nor a wait the label is the sentence alone`() {
        assertThat(CallCaptionAccessibility.of(line(), "Original", null).label).isEqualTo("Ada : Bonjour")
    }
}
