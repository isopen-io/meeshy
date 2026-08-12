package me.meeshy.sdk.model.call

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * A single ICE server (STUN/TURN) as returned in the `call:initiate` ACK,
 * mirroring the iOS `SocketIceServer` (`MessageSocketManager.swift`). The
 * gateway may send `urls` as either a single string or an array of strings —
 * [IceServerUrlsSerializer] normalises both to a [List] so a downstream WebRTC
 * config never has to branch on the wire shape.
 */
@Serializable
data class SocketIceServer(
    @Serializable(with = IceServerUrlsSerializer::class)
    val urls: List<String>,
    val username: String? = null,
    val credential: String? = null,
)

/**
 * Reads the polymorphic `urls` field of an ICE server: a JSON string becomes a
 * one-element list, a JSON array becomes the list of its string entries, and any
 * other shape yields an empty list rather than throwing (the server is still
 * usable if a sibling field carries a valid URL). Serialises back as a plain
 * array so a round-trip is total.
 */
object IceServerUrlsSerializer : KSerializer<List<String>> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("me.meeshy.sdk.model.call.IceServerUrls", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): List<String> {
        val input = decoder as? JsonDecoder ?: return emptyList()
        return when (val element = input.decodeJsonElement()) {
            is JsonArray -> element.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            is JsonPrimitive -> element.contentOrNull?.let(::listOf) ?: emptyList()
            else -> emptyList()
        }
    }

    override fun serialize(encoder: Encoder, value: List<String>) {
        encoder.encodeString(value.joinToString(","))
    }
}

/**
 * The real call identity minted by the gateway in the `call:initiate` ACK:
 * the MongoDB [callId] every subsequent outbound emit is keyed by, the negotiated
 * architecture [mode] (`"p2p"`/`"sfu"`), the per-user [iceServers] (TURN
 * credentials the caller MUST configure WebRTC with before building any SDP
 * offer), and the credential [ttlSeconds]. Parity with the iOS `CallInitiateAck`.
 */
data class CallInitiateAck(
    val callId: String,
    val mode: String? = null,
    val iceServers: List<SocketIceServer> = emptyList(),
    val ttlSeconds: Int? = null,
)

/**
 * The outcome of emitting `call:initiate` and awaiting the gateway ACK. Mirrors
 * the iOS `CallInitiateError` cases, but as a total sealed result rather than a
 * thrown error so the caller pattern-matches every branch:
 *
 * - [Success] — the ACK carried `success:true` and a non-blank `callId`.
 * - [ServerError] — the gateway rejected the initiate (room full, conversation
 *   closed, `CALL_ALREADY_ACTIVE`, …); [message] is the human-readable cause.
 * - [Malformed] — the ACK body could not be decoded (bad JSON or an
 *   `iceServers` array of the wrong shape).
 * - [Timeout] — no ACK arrived within the emit window (transport-level; produced
 *   only by the socket manager, never by [CallInitiateAckParser]).
 */
sealed interface CallInitiateResult {
    data class Success(val ack: CallInitiateAck) : CallInitiateResult
    data class ServerError(val message: String) : CallInitiateResult
    data object Malformed : CallInitiateResult
    data object Timeout : CallInitiateResult
}

/**
 * Pure parser for the `call:initiate` ACK body. Total and side-effect-free:
 * every input maps to exactly one [CallInitiateResult] and nothing throws.
 *
 * Faithful to the iOS `emitCallInitiate` guard: a [CallInitiateResult.Success]
 * requires `success == true` AND a non-blank `data.callId`; otherwise the
 * gateway's error is surfaced as [CallInitiateResult.ServerError], with the
 * message drawn (in order) from `error.message`, a bare-string `error`, else
 * `"unknown error"`. A body that fails to decode is [CallInitiateResult.Malformed].
 */
object CallInitiateAckParser {

    const val UNKNOWN_ERROR = "unknown error"

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    fun parse(rawJson: String): CallInitiateResult = runCatching {
        val response = json.decodeFromString<AckResponse>(rawJson)
        val callId = response.data?.callId
        if (response.success && !callId.isNullOrBlank()) {
            CallInitiateResult.Success(
                CallInitiateAck(
                    callId = callId,
                    mode = response.data.mode,
                    iceServers = response.data.iceServers,
                    ttlSeconds = response.data.ttl,
                ),
            )
        } else {
            CallInitiateResult.ServerError(messageOf(response.error))
        }
    }.getOrElse { CallInitiateResult.Malformed }

    private fun messageOf(error: JsonElement?): String = when (error) {
        is JsonObject -> error["message"]?.jsonPrimitive?.contentOrNull ?: UNKNOWN_ERROR
        is JsonPrimitive -> error.contentOrNull?.takeIf { error.isString } ?: UNKNOWN_ERROR
        else -> UNKNOWN_ERROR
    }

    @Serializable
    private data class AckResponse(
        val success: Boolean = false,
        val data: AckData? = null,
        val error: JsonElement? = null,
    )

    @Serializable
    private data class AckData(
        val callId: String? = null,
        val mode: String? = null,
        val iceServers: List<SocketIceServer> = emptyList(),
        val ttl: Int? = null,
    )
}
