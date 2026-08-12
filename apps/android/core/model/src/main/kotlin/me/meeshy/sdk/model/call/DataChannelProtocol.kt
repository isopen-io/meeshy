package me.meeshy.sdk.model.call

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The typed routing of one inbound frame received on the peer-to-peer WebRTC
 * data channel (iOS labels the channel `"transcription"`). A raw frame maps to
 * exactly one of these — a total, side-effect-free classification.
 *
 * Port of iOS `DataChannelInbound` (`WebRTCTypes.swift`), extended with the
 * [Caption] arm so the same channel doubles as the P2P transcript transport the
 * captions overlay ([CallCaptionSegment]) consumes — no server round-trip.
 */
sealed interface DataChannelInbound {
    /**
     * The peer hung up in-band (WhatsApp-style instant cut): the far end tears
     * the call down immediately without waiting for the authoritative server
     * `call:ended` fanout (which still follows and dedupes against the already
     * `Ended` state). [reason] is the optional cause string, absent when the
     * peer sent a bare `bye`.
     */
    data class Bye(val reason: String?) : DataChannelInbound

    /**
     * A live transcript segment from the remote speaker, ready for the captions
     * overlay. Always [CallCaptionSegment.isLocal] `= false`: a frame arriving
     * over the channel is by definition the peer's speech, never the viewer's —
     * a wire `isLocal` claim can never make a received caption render as "you".
     */
    data class Caption(val segment: CallCaptionSegment) : DataChannelInbound

    /**
     * A frame that carries no actionable state: the `ping` keep-alive, an unknown
     * future message type, or malformed/empty noise. Inert by design.
     */
    data object Ignored : DataChannelInbound
}

/**
 * The pure codec for the in-band data-channel control protocol. Encodes the
 * frames a call sends to its peer and classifies the frames it receives. Total
 * and side-effect-free: [decode] never throws, degrading any unrecognised or
 * malformed input to [DataChannelInbound.Ignored] rather than dropping the
 * transport.
 */
object DataChannelCodec {

    const val TYPE_BYE: String = "bye"
    const val TYPE_PING: String = "ping"
    const val TYPE_CAPTION: String = "caption"

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    /** The in-band hangup frame; [reason] is omitted from the wire when null. */
    fun encodeBye(reason: String? = null): ByteArray =
        json.encodeToString(ControlWire(type = TYPE_BYE, reason = reason)).encodeToByteArray()

    /** The keep-alive heartbeat frame. */
    fun encodePing(): ByteArray =
        json.encodeToString(ControlWire(type = TYPE_PING)).encodeToByteArray()

    /**
     * A transcript frame carrying [segment] to the peer. The viewer-relative
     * `isLocal` flag is intentionally not transmitted (it is meaningless to the
     * receiver, who always treats an inbound caption as remote); blank optional
     * translation fields are omitted.
     */
    fun encodeCaption(segment: CallCaptionSegment): ByteArray =
        json.encodeToString(
            CaptionWire(
                type = TYPE_CAPTION,
                speakerId = segment.speakerId,
                speakerName = segment.speakerName,
                text = segment.text,
                translatedText = segment.translatedText?.takeUnless { it.isBlank() },
                translatedLanguage = segment.translatedLanguage?.takeUnless { it.isBlank() },
            ),
        ).encodeToByteArray()

    fun decode(bytes: ByteArray): DataChannelInbound = decode(bytes.decodeToString())

    fun decode(frame: String): DataChannelInbound {
        val obj = runCatching { json.parseToJsonElement(frame) }.getOrNull() as? JsonObject
            ?: return DataChannelInbound.Ignored
        return when (obj.stringOrNull("type")) {
            TYPE_BYE -> DataChannelInbound.Bye(reason = obj.stringOrNull("reason"))
            TYPE_CAPTION -> decodeCaption(obj)
            else -> DataChannelInbound.Ignored
        }
    }

    private fun decodeCaption(obj: JsonObject): DataChannelInbound {
        val speakerId = obj.nonBlankString("speakerId") ?: return DataChannelInbound.Ignored
        val speakerName = obj.nonBlankString("speakerName") ?: return DataChannelInbound.Ignored
        val text = obj.nonBlankString("text") ?: return DataChannelInbound.Ignored
        return DataChannelInbound.Caption(
            CallCaptionSegment(
                speakerId = speakerId,
                speakerName = speakerName,
                isLocal = false,
                text = text,
                translatedText = obj.nonBlankString("translatedText"),
                translatedLanguage = obj.nonBlankString("translatedLanguage"),
            ),
        )
    }

    private fun JsonObject.stringOrNull(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

    private fun JsonObject.nonBlankString(key: String): String? =
        stringOrNull(key)?.takeUnless { it.isBlank() }

    @Serializable
    private data class ControlWire(val type: String, val reason: String? = null)

    @Serializable
    private data class CaptionWire(
        val type: String,
        val speakerId: String,
        val speakerName: String,
        val text: String,
        val translatedText: String? = null,
        val translatedLanguage: String? = null,
    )
}
