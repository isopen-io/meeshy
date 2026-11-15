package me.meeshy.sdk.talkie

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.relation.TalkieContract
import me.meeshy.sdk.model.relation.TalkieStartVerdict
import me.meeshy.sdk.model.socket.SocketAckPayloadSource
import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.socket.SocketAckEmitter
import me.meeshy.sdk.socket.SocketManager
import org.json.JSONObject

/** Qui porte MA voix vers la passerelle (#17150, iso `TalkieEmitting` du SDK iOS). L'écran ne voit pas la socket. */
interface TalkieEmitting {
    /** La socket est connectée : sans elle, l'appui dit « hors ligne » sans rien ouvrir. */
    val isConnected: Boolean

    suspend fun start(toUserId: String): TalkieStartVerdict

    fun sendChunk(talkieId: String, seq: Int, capturedAtMs: Long, data: ByteArray)

    fun end(talkieId: String)
}

/**
 * L'émission du talkie sur la socket de messages : `talkie:start` (accusé), `talkie:send-chunk` (binaire natif, jamais
 * du base64 — Socket.IO replace le `ByteArray` en pièce binaire) et `talkie:end`.
 */
@Singleton
class TalkieSocketEmitter internal constructor(
    private val transport: Transport,
    private val acks: SocketAckEmitter,
) : TalkieEmitting {

    /** La socket, réduite à ce que le talkie émet. */
    internal interface Transport {
        val isConnected: Boolean
        fun emit(event: String, data: JSONObject)
    }

    @Inject
    constructor(sockets: SocketManager) : this(
        object : Transport {
            override val isConnected: Boolean get() = sockets.isConnected
            override fun emit(event: String, data: JSONObject) = sockets.emit(event, data)
        },
        SocketAckEmitter(sockets),
    )

    override val isConnected: Boolean get() = transport.isConnected

    override suspend fun start(toUserId: String): TalkieStartVerdict {
        val payload = JSONObject().put("toUserId", toUserId).put("codec", TalkieContract.CODEC)
        val ack = acks.emitWithAck(SocketEventNames.TALKIE_START, payload, START_ACK_TIMEOUT_MS, SocketAckPayloadSource.DATA)
        return TalkieStartVerdict.read(ack)
    }

    override fun sendChunk(talkieId: String, seq: Int, capturedAtMs: Long, data: ByteArray) {
        if (!transport.isConnected) return
        val payload = JSONObject()
            .put("talkieId", talkieId)
            .put("seq", seq)
            .put("capturedAt", capturedAtMs)
            .put("data", data)
        transport.emit(SocketEventNames.TALKIE_SEND_CHUNK, payload)
    }

    override fun end(talkieId: String) {
        if (!transport.isConnected) return
        transport.emit(SocketEventNames.TALKIE_END, JSONObject().put("talkieId", talkieId))
    }

    companion object {
        /** `TALKIE_START_ACK_MS` : un accusé qui tarde au-delà, la socket est tenue pour tombée. */
        const val START_ACK_TIMEOUT_MS: Long = 5_000L
    }
}
