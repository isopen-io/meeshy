package me.meeshy.sdk.socket

import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.call.CallControlRefusal
import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.sdk.model.call.CallLiveFrameTexts
import me.meeshy.sdk.model.call.CallReactionEmoji
import org.json.JSONObject
import kotlin.coroutines.resume

/** Délai d'accusé des verbes de contrôle — aligné sur iOS (`timingOutAfter: 10`). */
internal const val CALL_ACK_TIMEOUT_MS = 10_000L

/**
 * Émet [event] et rend la charge d'accusé brute : `null` si la socket est absente
 * (NO_SOCKET) ou muette passé le délai (TIMEOUT) — le code se lit via [CallAck].
 */
internal sealed interface CallAck {
    data object NoSocket : CallAck
    data object TimedOut : CallAck
    data class Received(val body: JSONObject?) : CallAck
}

internal suspend fun SocketManager.emitForAck(event: String, payload: JSONObject): CallAck {
    if (connectionState.value != SocketConnectionState.CONNECTED) return CallAck.NoSocket
    val reply = withTimeoutOrNull(CALL_ACK_TIMEOUT_MS) {
        suspendCancellableCoroutine<CallAck> { continuation ->
            emit(event, payload) { args ->
                if (continuation.isActive) continuation.resume(CallAck.Received(args.firstOrNull() as? JSONObject))
            }
        }
    }
    return reply ?: CallAck.TimedOut
}

/** `{ success: true }` -> `null` ; tout le reste est un refus (rien ne se croit accepté sans que la passerelle l'ait dit). */
internal fun CallAck.controlRefusal(): CallControlRefusal? = when (this) {
    CallAck.NoSocket -> CallControlRefusal(CallControlRefusal.NO_SOCKET)
    CallAck.TimedOut -> CallControlRefusal(CallControlRefusal.TIMEOUT)
    is CallAck.Received -> when {
        body == null -> CallControlRefusal(CallControlRefusal.MALFORMED_ACK)
        body.optBoolean("success", false) -> null
        else -> CallControlRefusal(body.optString("code").ifBlank { CallControlRefusal.MALFORMED_ACK })
    }
}

/**
 * Les verbes d'un appel en cours — inviter, couper le micro d'un participant, réagir —
 * et le cadre en direct, tous à accusé. Le droit est décidé par la passerelle.
 */
internal class CallControlsSocket(private val socketManager: SocketManager) {

    suspend fun invite(callId: String, userId: String): Result<Unit> =
        verb("call:invite-participant", JSONObject().put("callId", callId).put("userId", userId))

    suspend fun mute(callId: String, targetUserId: String): Result<Unit> =
        verb("call:mute-participant", JSONObject().put("callId", callId).put("targetUserId", targetUserId))

    suspend fun react(callId: String, emoji: CallReactionEmoji): Result<Unit> =
        verb("call:reaction", JSONObject().put("callId", callId).put("emoji", emoji.glyph))

    suspend fun selectFrame(
        callId: String,
        frameId: String?,
        texts: CallLiveFrameTexts?,
        reply: CallLiveFrameReply?,
    ): Result<Unit> = verb("call:frame-select", framePayload(callId, frameId, texts, reply))

    private suspend fun verb(event: String, payload: JSONObject): Result<Unit> =
        socketManager.emitForAck(event, payload).controlRefusal()
            ?.let { Result.failure(it) }
            ?: Result.success(Unit)

    companion object {
        /** `frameId == null` part en `null` JSON : la passerelle exige la clé, `null` retire le cadre. */
        fun framePayload(
            callId: String,
            frameId: String?,
            texts: CallLiveFrameTexts?,
            reply: CallLiveFrameReply?,
        ): JSONObject {
            val payload = JSONObject().put("callId", callId).put("frameId", frameId ?: JSONObject.NULL)
            reply?.let { payload.put("reply", it.wire) }
            texts?.payload()?.takeIf { it.isNotEmpty() }?.let { payload.put("texts", JSONObject(it)) }
            return payload
        }
    }
}
