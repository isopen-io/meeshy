package me.meeshy.sdk.model.call

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * The outcome of emitting `call:join` and awaiting the gateway ACK. The callee
 * joins the room **with an ACK** (parity with iOS `emitCallJoinWithAck`) so its
 * room membership is confirmed before any further emit — critically, the ACK also
 * carries the per-user [iceServers] the WebRTC engine must configure with,
 * sparing a separate `call:request-ice-servers` round-trip. That round-trip
 * otherwise races the not-yet-joined room and is rejected `NOT_A_PARTICIPANT`
 * ("Not in call room"), failing the call the instant the callee answers.
 *
 * - [Success] — `success:true`; [iceServers] is the (possibly empty) TURN/STUN set.
 * - [Failure] — the gateway rejected the join, no ACK arrived, or the body could
 *   not be decoded; the join can't be trusted, so the FSM settles to failed.
 */
sealed interface CallJoinResult {
    data class Success(val iceServers: List<SocketIceServer>) : CallJoinResult
    data class Failure(val message: String) : CallJoinResult
}

/**
 * Pure parser for the `call:join` ACK body (`{success, data:{callSession, iceServers}}`).
 * Total and side-effect-free: every input maps to exactly one [CallJoinResult] and
 * nothing throws. Unknown keys (e.g. `callSession`) are ignored. A `null` raw (no
 * ACK within the emit window) is [CallJoinResult.Failure]. The error message is
 * drawn from `error.message`, a bare-string `error`, else [UNKNOWN_ERROR].
 */
object CallJoinAckParser {

    const val UNKNOWN_ERROR = "unknown error"
    const val NO_ACK = "no join ack"

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    fun parse(rawJson: String?): CallJoinResult {
        if (rawJson == null) return CallJoinResult.Failure(NO_ACK)
        return runCatching {
            val response = json.decodeFromString<JoinAckResponse>(rawJson)
            if (response.success) {
                CallJoinResult.Success(response.data?.iceServers ?: emptyList())
            } else {
                CallJoinResult.Failure(messageOf(response.error))
            }
        }.getOrElse { CallJoinResult.Failure(UNKNOWN_ERROR) }
    }

    private fun messageOf(error: JsonElement?): String = when (error) {
        is JsonObject -> error["message"]?.jsonPrimitive?.contentOrNull ?: UNKNOWN_ERROR
        is JsonPrimitive -> error.contentOrNull?.takeIf { error.isString } ?: UNKNOWN_ERROR
        else -> UNKNOWN_ERROR
    }

    @Serializable
    private data class JoinAckResponse(
        val success: Boolean = false,
        val data: JoinAckData? = null,
        val error: JsonElement? = null,
    )

    @Serializable
    private data class JoinAckData(
        val iceServers: List<SocketIceServer> = emptyList(),
    )
}
