package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the peer-to-peer WebRTC data-channel control protocol
 * ([DataChannelCodec] + [DataChannelInbound]).
 *
 * The channel (iOS labels it `"transcription"`) carries three kinds of in-band
 * frame between the two peers:
 *  - `bye` — the WhatsApp-style instant hangup shortcut (peer cuts without
 *    waiting for the server `call:ended` fanout). Port of iOS
 *    `DataChannelControlMessage` / `DataChannelInbound.decode`.
 *  - `ping` — a keep-alive heartbeat; inert on receive (iOS routes it to
 *    `.ignored`).
 *  - `caption` — a live transcript segment relayed straight to the remote
 *    captions overlay (the P2P transcript transport the captions core lists as
 *    pending), following the Prisme-faithful [CallCaptionSegment] shape.
 *
 * Everything here asserts observable behaviour through the public API — the
 * routed [DataChannelInbound] a raw frame decodes to, and that an encoded frame
 * round-trips — never the internal shape of the wire types.
 */
class DataChannelProtocolTest {

    private fun segment(
        text: String = "hello world",
        translatedText: String? = null,
        translatedLanguage: String? = null,
        speakerId: String = "u1",
        speakerName: String = "Ada",
        isLocal: Boolean = true,
    ) = CallCaptionSegment(
        speakerId = speakerId,
        speakerName = speakerName,
        isLocal = isLocal,
        text = text,
        translatedText = translatedText,
        translatedLanguage = translatedLanguage,
    )

    // --- decode: bye -------------------------------------------------------

    @Test
    fun `a bye frame with a reason decodes to Bye carrying that reason`() {
        val frame = """{"type":"bye","reason":"busy"}"""
        assertThat(DataChannelCodec.decode(frame)).isEqualTo(DataChannelInbound.Bye("busy"))
    }

    @Test
    fun `a bye frame without a reason decodes to Bye with a null reason`() {
        val frame = """{"type":"bye"}"""
        assertThat(DataChannelCodec.decode(frame)).isEqualTo(DataChannelInbound.Bye(null))
    }

    @Test
    fun `a bye reason that is not a JSON string is dropped to null rather than coerced`() {
        val frame = """{"type":"bye","reason":42}"""
        assertThat(DataChannelCodec.decode(frame)).isEqualTo(DataChannelInbound.Bye(null))
    }

    @Test
    fun `unknown keys alongside a bye are ignored`() {
        val frame = """{"type":"bye","reason":"declined","seq":7,"nested":{"x":1}}"""
        assertThat(DataChannelCodec.decode(frame)).isEqualTo(DataChannelInbound.Bye("declined"))
    }

    // --- decode: ping / unknown / noise -----------------------------------

    @Test
    fun `a ping keep-alive is inert on receive`() {
        assertThat(DataChannelCodec.decode("""{"type":"ping"}""")).isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `an unknown message type is ignored`() {
        assertThat(DataChannelCodec.decode("""{"type":"reaction","emoji":"👍"}"""))
            .isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `a frame with no type field is ignored`() {
        assertThat(DataChannelCodec.decode("""{"reason":"busy"}""")).isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `a type field that is not a string is ignored`() {
        assertThat(DataChannelCodec.decode("""{"type":123}""")).isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `malformed JSON is ignored, never a crash`() {
        assertThat(DataChannelCodec.decode("{not json")).isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `an empty frame is ignored`() {
        assertThat(DataChannelCodec.decode("")).isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `a whitespace-only frame is ignored`() {
        assertThat(DataChannelCodec.decode("   ")).isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `a JSON array frame is ignored`() {
        assertThat(DataChannelCodec.decode("""[1,2,3]""")).isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `a bare JSON string frame is ignored`() {
        assertThat(DataChannelCodec.decode("\"bye\"")).isEqualTo(DataChannelInbound.Ignored)
    }

    // --- decode: caption ---------------------------------------------------

    @Test
    fun `a caption frame decodes to a Caption segment`() {
        val frame = """{"type":"caption","speakerId":"u9","speakerName":"Zoe","text":"good morning"}"""
        assertThat(DataChannelCodec.decode(frame)).isEqualTo(
            DataChannelInbound.Caption(
                CallCaptionSegment(
                    speakerId = "u9",
                    speakerName = "Zoe",
                    isLocal = false,
                    text = "good morning",
                ),
            ),
        )
    }

    @Test
    fun `a caption frame carries its translation and language`() {
        val frame = """{"type":"caption","speakerId":"u9","speakerName":"Zoe","text":"hi","translatedText":"salut","translatedLanguage":"fr"}"""
        assertThat(DataChannelCodec.decode(frame)).isEqualTo(
            DataChannelInbound.Caption(
                CallCaptionSegment(
                    speakerId = "u9",
                    speakerName = "Zoe",
                    isLocal = false,
                    text = "hi",
                    translatedText = "salut",
                    translatedLanguage = "fr",
                ),
            ),
        )
    }

    @Test
    fun `a decoded caption is always from the remote peer even if the wire claims local`() {
        val frame = """{"type":"caption","speakerId":"u9","speakerName":"Zoe","text":"hi","isLocal":true}"""
        val decoded = DataChannelCodec.decode(frame) as DataChannelInbound.Caption
        assertThat(decoded.segment.isLocal).isFalse()
    }

    @Test
    fun `a caption frame missing text is ignored`() {
        val frame = """{"type":"caption","speakerId":"u9","speakerName":"Zoe"}"""
        assertThat(DataChannelCodec.decode(frame)).isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `a caption frame with blank text is ignored`() {
        val frame = """{"type":"caption","speakerId":"u9","speakerName":"Zoe","text":"   "}"""
        assertThat(DataChannelCodec.decode(frame)).isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `a caption frame missing speaker id is ignored`() {
        val frame = """{"type":"caption","speakerName":"Zoe","text":"hi"}"""
        assertThat(DataChannelCodec.decode(frame)).isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `a caption frame with blank speaker name is ignored`() {
        val frame = """{"type":"caption","speakerId":"u9","speakerName":"","text":"hi"}"""
        assertThat(DataChannelCodec.decode(frame)).isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `a caption frame with a blank translation drops the translation but keeps the line`() {
        val frame = """{"type":"caption","speakerId":"u9","speakerName":"Zoe","text":"hi","translatedText":"  "}"""
        assertThat(DataChannelCodec.decode(frame)).isEqualTo(
            DataChannelInbound.Caption(
                CallCaptionSegment(
                    speakerId = "u9",
                    speakerName = "Zoe",
                    isLocal = false,
                    text = "hi",
                    translatedText = null,
                ),
            ),
        )
    }

    // --- encode wire format (interop contract) -----------------------------

    @Test
    fun `encoding a bye without a reason omits the reason key`() {
        assertThat(DataChannelCodec.encodeBye(null).decodeToString()).isEqualTo("""{"type":"bye"}""")
    }

    @Test
    fun `encoding a bye with a reason includes it`() {
        assertThat(DataChannelCodec.encodeBye("busy").decodeToString())
            .isEqualTo("""{"type":"bye","reason":"busy"}""")
    }

    @Test
    fun `encoding a ping produces the bare keep-alive frame`() {
        assertThat(DataChannelCodec.encodePing().decodeToString()).isEqualTo("""{"type":"ping"}""")
    }

    // --- round trips -------------------------------------------------------

    @Test
    fun `a bye reason round-trips through encode then decode`() {
        val encoded = DataChannelCodec.encodeBye("network-lost")
        assertThat(DataChannelCodec.decode(encoded)).isEqualTo(DataChannelInbound.Bye("network-lost"))
    }

    @Test
    fun `a reasonless bye round-trips through encode then decode`() {
        assertThat(DataChannelCodec.decode(DataChannelCodec.encodeBye(null)))
            .isEqualTo(DataChannelInbound.Bye(null))
    }

    @Test
    fun `an encoded ping round-trips to Ignored`() {
        assertThat(DataChannelCodec.decode(DataChannelCodec.encodePing()))
            .isEqualTo(DataChannelInbound.Ignored)
    }

    @Test
    fun `a caption round-trips, flipping isLocal to remote and preserving translation`() {
        val local = segment(text = "hi", translatedText = "salut", translatedLanguage = "fr", isLocal = true)
        val decoded = DataChannelCodec.decode(DataChannelCodec.encodeCaption(local)) as DataChannelInbound.Caption
        assertThat(decoded.segment).isEqualTo(
            CallCaptionSegment(
                speakerId = "u1",
                speakerName = "Ada",
                isLocal = false,
                text = "hi",
                translatedText = "salut",
                translatedLanguage = "fr",
            ),
        )
    }

    @Test
    fun `a caption without a translation round-trips with no translation`() {
        val decoded = DataChannelCodec.decode(DataChannelCodec.encodeCaption(segment(text = "solo")))
                as DataChannelInbound.Caption
        assertThat(decoded.segment.translatedText).isNull()
        assertThat(decoded.segment.translatedLanguage).isNull()
        assertThat(decoded.segment.text).isEqualTo("solo")
    }

    // --- byte-array overload ----------------------------------------------

    @Test
    fun `the byte-array decode overload matches the string overload`() {
        val bytes = """{"type":"bye","reason":"bye-bytes"}""".encodeToByteArray()
        assertThat(DataChannelCodec.decode(bytes)).isEqualTo(DataChannelInbound.Bye("bye-bytes"))
    }
}
