package me.meeshy.sdk.relation

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.relation.SharedLocationFix
import me.meeshy.sdk.model.relation.SharedLocationStartRequest
import me.meeshy.sdk.model.relation.SharedLocationStartVerdict
import me.meeshy.sdk.model.socket.SocketAck
import me.meeshy.sdk.model.socket.SocketAckPayloadSource
import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.socket.SocketAckEmitter
import me.meeshy.sdk.socket.SocketManager
import org.json.JSONObject

/** Qui porte MA position vers la passerelle (#16985, iso `SharedLocationEmitting` du SDK iOS). L'écran ne voit pas la socket. */
interface SharedLocationEmitting {
    suspend fun start(request: SharedLocationStartRequest): SharedLocationStartVerdict

    suspend fun update(fix: SharedLocationFix): SharedLocationStartVerdict

    /** `true` quand la passerelle a confirmé l'arrêt. */
    suspend fun stop(): Boolean
}

/**
 * L'émission du partage de position sur la socket de messages : `location:share-start`, `location:share-update` et
 * `location:share-stop`, chacun avec son accusé (`SharedLocationAck`, `SharedLocationStopAck`). Un type à part : la
 * socket de messages n'en grossit pas.
 */
@Singleton
class SharedLocationSocketEmitter internal constructor(private val acks: SocketAckEmitter) : SharedLocationEmitting {

    @Inject
    constructor(sockets: SocketManager) : this(SocketAckEmitter(sockets))

    override suspend fun start(request: SharedLocationStartRequest): SharedLocationStartVerdict =
        send(SocketEventNames.LOCATION_SHARE_START, JSONObject(request.wire()))

    override suspend fun update(fix: SharedLocationFix): SharedLocationStartVerdict =
        send(SocketEventNames.LOCATION_SHARE_UPDATE, JSONObject(fix.wire()))

    override suspend fun stop(): Boolean =
        acks.emitWithAck(SocketEventNames.LOCATION_SHARE_STOP, JSONObject(), ACK_TIMEOUT_MS, SocketAckPayloadSource.NONE) is SocketAck.Accepted

    private suspend fun send(event: String, payload: JSONObject): SharedLocationStartVerdict =
        SharedLocationStartVerdict.read(acks.emitWithAck(event, payload, ACK_TIMEOUT_MS, SocketAckPayloadSource.DATA))

    companion object {
        /** Un accusé qui tarde au-delà, la socket est tenue pour tombée. */
        const val ACK_TIMEOUT_MS: Long = 8_000L
    }
}
