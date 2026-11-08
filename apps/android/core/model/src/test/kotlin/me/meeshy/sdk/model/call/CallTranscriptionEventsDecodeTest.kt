package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallTranscriptionEventsDecodeTest {

    private fun segment(isFinal: Boolean = true, text: String = "bonjour", id: String = "s1") =
        CallTranscriptionSegmentWire(id, text, "u1", 0, 900, isFinal, 0.9, "fr", 1_700_000_000_000)

    @Test
    fun `transcription-active decodes its three fields`() {
        val event = CallTranscriptionEvents.activeFrame("""{"callId":"c1","speakerId":"u2","active":true,"extra":1}""")

        assertThat(event).isEqualTo(CallTranscriptionActive("c1", "u2", true))
    }

    @Test
    fun `transcription-active without the flag is inert`() {
        assertThat(CallTranscriptionEvents.activeFrame("""{"callId":"c1","speakerId":"u2"}""")).isNull()
        assertThat(CallTranscriptionEvents.activeFrame("not json")).isNull()
    }

    @Test
    fun `a final segment of the active call is emitted with the iOS payload fields`() {
        val fields = CallTranscriptionEvents.relayFrame("c1", "c1", segment())

        assertThat(fields!!.keys).containsExactly(
            "id", "text", "speakerId", "startMs", "endMs", "isFinal", "confidence", "language", "capturedAtMs",
        )
    }

    @Test
    fun `a segment outside the active call is not emitted`() {
        assertThat(CallTranscriptionEvents.relayFrame("c1", "c2", segment())).isNull()
        assertThat(CallTranscriptionEvents.relayFrame("c1", null, segment())).isNull()
    }

    @Test
    fun `a partial or empty segment is not emitted`() {
        assertThat(CallTranscriptionEvents.relayFrame("c1", "c1", segment(isFinal = false))).isNull()
        assertThat(CallTranscriptionEvents.relayFrame("c1", "c1", segment(text = " "))).isNull()
        assertThat(CallTranscriptionEvents.relayFrame("c1", "c1", segment(id = ""))).isNull()
    }
}
