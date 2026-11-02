package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13333 — l'entrée de journal que l'iPhone pousse en P2P sur le canal « transcription » :
 * `{"type":"transcript-entry","entry":{…}}`, miroir de `CallTranscriptDataChannelMessage`
 * (`packages/shared/types/video-call.ts`) et de `DataChannelTranscriptMessage` (iOS). Android la lit
 * comme l'iPhone la décode, et l'écrit octet pour octet comme il l'écrit.
 */
class CallTranscriptEntryWireTest {

    private val iosFrame = """
        {"type":"transcript-entry","entry":{"id":"w-1","callId":"call-9","speakerId":"u-ios",
        "speakerDisplayName":"Ada","text":"How are you?","language":"en","capturedAtMs":1730000000123,
        "isFinal":false,"confidence":0.82}}
    """.trimIndent()

    @Test
    fun `an iPhone transcript entry is routed as the peer's journal entry, partial revision included`() {
        val inbound = DataChannelCodec.decode(iosFrame)

        assertThat(inbound).isEqualTo(
            DataChannelInbound.TranscriptEntry(
                CallTranscriptEntry(
                    id = "w-1",
                    callId = "call-9",
                    speakerId = "u-ios",
                    speakerDisplayName = "Ada",
                    text = "How are you?",
                    language = "en",
                    capturedAtMs = 1_730_000_000_123,
                    isFinal = false,
                    confidence = 0.82,
                ),
            ),
        )
    }

    @Test
    fun `an entry without id, call, speaker or text carries nothing and is inert`() {
        listOf("id", "callId", "speakerId", "text").forEach { missing ->
            val frame = iosFrame.replace("\"$missing\":", "\"x$missing\":")
            assertThat(DataChannelCodec.decode(frame)).isEqualTo(DataChannelInbound.Ignored)
        }
    }

    @Test
    fun `a blank display name or a missing confidence still lands — the receiver resolves the name from its roster`() {
        val frame = """{"type":"transcript-entry","entry":{"id":"w","callId":"c","speakerId":"s","speakerDisplayName":"",
            "text":"hi","language":"fr","capturedAtMs":5,"isFinal":true}}"""

        val entry = (DataChannelCodec.decode(frame) as DataChannelInbound.TranscriptEntry).entry

        assertThat(entry.speakerDisplayName).isEmpty()
        assertThat(entry.confidence).isEqualTo(0.0)
        assertThat(entry.isFinal).isTrue()
    }

    @Test
    fun `an encoded entry decodes back to itself, under the iOS type tag`() {
        val entry = CallTranscriptEntry("w-2", "call-1", "me", "Moi", "Bonjour", "fr", 42, isFinal = true, confidence = 0.5)

        val bytes = DataChannelCodec.encodeTranscriptEntry(entry)

        assertThat(bytes.decodeToString()).contains("\"type\":\"transcript-entry\"")
        assertThat(DataChannelCodec.decode(bytes)).isEqualTo(DataChannelInbound.TranscriptEntry(entry))
    }

    @Test
    fun `the gateway relay carries the merge key, the stamped name and the capture clock`() {
        val raw = """{"callId":"c","segment":{"id":"w-1","text":"Hello","translatedText":"Bonjour","speakerId":"u",
            "speakerDisplayName":"Ada","startMs":0,"endMs":900,"isFinal":true,"sourceLanguage":"en",
            "targetLanguage":"fr","confidence":0.9,"capturedAtMs":1730000000123}}"""

        val segment = CallSignalMapper.translatedSegment(raw)!!.segment

        assertThat(segment.id).isEqualTo("w-1")
        assertThat(segment.speakerDisplayName).isEqualTo("Ada")
        assertThat(segment.capturedAtMs).isEqualTo(1_730_000_000_123)
    }
}
