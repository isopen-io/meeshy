package me.meeshy.sdk.socket

import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.socket.SocketAck
import me.meeshy.sdk.model.socket.SocketAckParsing
import me.meeshy.sdk.model.socket.SocketAckPayloadSource
import me.meeshy.sdk.model.socket.SocketAckRefusal
import org.json.JSONObject
import kotlin.coroutines.resume

/** Le transport minimal d'une émission à accusé ; [SocketManager] l'implémente. */
internal interface AckTransport {
    val isConnected: Boolean
    fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit)
}

/**
 * Émission suspendue qui ATTEND l'accusé de la passerelle et sait lire un refus. Miroir de `SocketAckEmitting` (iOS).
 *
 * Une socket absente rend [SocketAckRefusal.NO_SOCKET] sans lever ; l'absence d'accusé dans [timeoutMs] rend
 * [SocketAck.Timeout]. Un refus est rendu tel quel : ce module ne le rejoue jamais par un autre transport.
 */
class SocketAckEmitter internal constructor(private val transport: AckTransport) {

    constructor(socketManager: SocketManager) : this(
        object : AckTransport {
            override val isConnected: Boolean get() = socketManager.isConnected
            override fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) = socketManager.emit(event, data, ack)
        },
    )

    suspend fun emitWithAck(
        event: String,
        payload: JSONObject,
        timeoutMs: Long,
        payloadAt: SocketAckPayloadSource = SocketAckPayloadSource.AUTO,
    ): SocketAck<JsonObject> {
        if (!transport.isConnected) return SocketAck.Refused(SocketAckRefusal.NO_SOCKET)
        val raw = withTimeoutOrNull(timeoutMs) {
            suspendCancellableCoroutine<String?> { continuation ->
                transport.emit(event, payload) { args ->
                    if (continuation.isActive) continuation.resume((args.firstOrNull() as? JSONObject)?.toString())
                }
            }
        }
        return SocketAckParsing.parse(raw, payloadAt)
    }

    /** Comme [emitWithAck], la charge décodée par [decode] ; un décodage qui échoue rend une charge absente. */
    suspend fun <P : Any> emitWithAck(
        event: String,
        payload: JSONObject,
        timeoutMs: Long,
        payloadAt: SocketAckPayloadSource = SocketAckPayloadSource.AUTO,
        decode: (JsonObject) -> P?,
    ): SocketAck<P> = when (val ack = emitWithAck(event, payload, timeoutMs, payloadAt)) {
        is SocketAck.Accepted -> SocketAck.Accepted(ack.payload?.let { runCatching { decode(it) }.getOrNull() })
        is SocketAck.Refused -> ack
        SocketAck.Timeout -> SocketAck.Timeout
    }
}
