package me.meeshy.sdk.socket

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.ContentCaptureRefusal
import me.meeshy.sdk.model.ContentCaptureReport
import me.meeshy.sdk.model.EphemeralSocketEventNames
import me.meeshy.sdk.model.socket.SocketAck
import me.meeshy.sdk.model.socket.SocketAckPayloadSource
import org.json.JSONArray
import org.json.JSONObject

/** Émet une déclaration de capture et rend les messages pour lesquels un avis EXISTE désormais, ou le refus. */
fun interface ContentCaptureSocketEmitting {
    suspend fun emit(report: ContentCaptureReport): Result<List<String>>
}

/**
 * `message:capture-detected` avec accusé (miroir de `emitContentCapture`, iOS) : `{ success, data: { noticedMessageIds } }`
 * ou `{ success:false, code }`. Toute autre forme — dont l'échéance — est un refus : rien ne se croit annoncé sans que la
 * passerelle l'ait dit. Les événements ÉPHÉMÈRES reçus (`message:countdown-started`, `message:consumed`,
 * `message:view-once-purged`) sont routés par [ConversationSocketEventsManager].
 */
@Singleton
class EphemeralSocketEvents internal constructor(
    private val acks: SocketAckEmitter,
    private val timeoutMs: Long = ACK_TIMEOUT_MS,
) : ContentCaptureSocketEmitting {

    @Inject
    constructor(socketManager: SocketManager) : this(SocketAckEmitter(socketManager), ACK_TIMEOUT_MS)

    override suspend fun emit(report: ContentCaptureReport): Result<List<String>> {
        val ack = acks.emitWithAck(
            event = EphemeralSocketEventNames.MESSAGE_CAPTURE_DETECTED,
            payload = payload(report),
            timeoutMs = timeoutMs,
            payloadAt = SocketAckPayloadSource.DATA,
        )
        return when (ack) {
            is SocketAck.Accepted -> {
                val noticed = ack.payload?.let { noticedIds(it) }
                if (noticed == null) Result.failure<List<String>>(ContentCaptureRefusal(ContentCaptureRefusal.MALFORMED_ACK)) else Result.success(noticed)
            }
            is SocketAck.Refused -> Result.failure<List<String>>(ContentCaptureRefusal(ack.refusal.code ?: ContentCaptureRefusal.MALFORMED_ACK))
            SocketAck.Timeout -> Result.failure<List<String>>(ContentCaptureRefusal(ContentCaptureRefusal.TIMEOUT))
        }
    }

    private fun payload(report: ContentCaptureReport): JSONObject = JSONObject().apply {
        put("conversationId", report.conversationId)
        put("messageIds", JSONArray(report.messageIds))
        put("kind", report.kind.wire)
        put("captureId", report.captureId)
    }

    private fun noticedIds(data: JsonObject): List<String>? =
        (data["noticedMessageIds"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull }

    companion object {
        const val ACK_TIMEOUT_MS: Long = 10_000
    }
}
