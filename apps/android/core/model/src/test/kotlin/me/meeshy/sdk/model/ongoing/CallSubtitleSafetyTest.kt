package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallSubtitleSafetyTest {

    private fun law(
        encrypted: Boolean?,
        onDevice: Boolean = false,
        text: String = "Bonjour",
        isFinal: Boolean = true,
        active: Boolean = true,
    ) = CallActivityLaw.servedCaption(
        CallActivityLaw.Input(
            phase = OngoingCallPhase.Connected, title = "A", isVideo = false, isMuted = false,
            isEndToEndEncrypted = encrypted, captionsActive = active,
            caption = CallActivityCaption("Alice", text, "fr", isFinal, onDevice),
        ),
    )

    @Test
    fun `an unknown encryption is held as encrypted and serves nothing`() {
        assertThat(law(encrypted = null)).isNull()
    }

    @Test
    fun `an encrypted call serves nothing unless translated on the device`() {
        assertThat(law(encrypted = true)).isNull()
        assertThat(law(encrypted = true, onDevice = true)).isNotNull()
    }

    @Test
    fun `a clear call serves a final non blank caption`() {
        assertThat(law(encrypted = false)!!.text).isEqualTo("Bonjour")
        assertThat(law(encrypted = false, isFinal = false)).isNull()
        assertThat(law(encrypted = false, text = "   ")).isNull()
        assertThat(law(encrypted = false, active = false)).isNull()
    }

    @Test
    fun `a long caption keeps its last 140 characters behind an ellipsis`() {
        val served = law(encrypted = false, text = "x".repeat(200))!!.text

        assertThat(served).hasLength(CallSubtitleSafety.CAPTION_LIMIT)
        assertThat(served).startsWith("…")
    }
}
