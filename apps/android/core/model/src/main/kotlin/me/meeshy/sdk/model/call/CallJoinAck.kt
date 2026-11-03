package me.meeshy.sdk.model.call

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import me.meeshy.sdk.model.socket.SocketAck
import me.meeshy.sdk.model.socket.SocketAckParsing
import me.meeshy.sdk.model.socket.SocketAckPayloadSource

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
 *   not be decoded; the join can't be trusted, so the FSM settles to failed. A
 *   refusal carries the gateway [Failure.code] and, for a call already ended
 *   (`CALL_ENDED`), its real [Failure.endReason].
 */
sealed interface CallJoinResult {
    data class Success(val iceServers: List<SocketIceServer>) : CallJoinResult
    data class Failure(val message: String, val code: String? = null, val endReason: String? = null) : CallJoinResult
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
        return when (val ack = SocketAckParsing.parse(rawJson, SocketAckPayloadSource.DATA)) {
            is SocketAck.Timeout -> CallJoinResult.Failure(UNKNOWN_ERROR)
            is SocketAck.Refused -> ack.refusal.let { CallJoinResult.Failure(it.message ?: UNKNOWN_ERROR, it.errorCode, it.endReason) }
            is SocketAck.Accepted -> runCatching {
                val data = ack.payload?.let { json.decodeFromJsonElement<JoinAckData>(it) }
                CallJoinResult.Success(data?.iceServers ?: emptyList())
            }.getOrElse { CallJoinResult.Failure(UNKNOWN_ERROR) }
        }
    }

    @Serializable
    private data class JoinAckData(
        val iceServers: List<SocketIceServer> = emptyList(),
    )
}
