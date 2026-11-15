package me.meeshy.sdk.socket

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.relation.TogetherEvents
import me.meeshy.sdk.model.relation.TogetherInbound
import me.meeshy.sdk.model.relation.TogetherInviteOutcome
import me.meeshy.sdk.model.relation.TogetherJoinOutcome
import me.meeshy.sdk.model.relation.TogetherPlayback
import me.meeshy.sdk.model.relation.TogetherWire
import org.json.JSONObject

/**
 * « Ensemble » (#17011, #17100) sur la socket Android — miroir de `MessageSocketManager+Together.swift`.
 *
 * Entrent, sur la room `user:<id>` et par la MÊME voie série que les autres routes : `together:invited|started|synced|
 * ended`, sur UN flux qui garde l'ordre du fil (un `synced` ne doublera jamais le `started` qu'il suit). Sortent, avec
 * accusé : `together:invite|join|sync|leave`. Le client ne rejuge aucune règle : la passerelle a jugé.
 */
@Singleton
class TogetherSocket @Inject constructor(
    private val router: SocketEventRouter,
    private val socketManager: SocketManager,
) : RealtimeBinding {

    private val installed = AtomicBoolean(false)
    private val _events = SocketInboundRoute.subject<TogetherInbound>()

    /** Les quatre événements reçus, lus dans leur type ; une charge illisible ne produit rien. */
    val events: SharedFlow<TogetherInbound> = _events.exposed()

    override fun attach() {
        if (installed.compareAndSet(false, true)) router.install(routes())
    }

    override fun detach() {
        installed.set(false)
    }

    internal fun routes(): List<SocketInboundRoute> = TogetherWire.INBOUND.map { event ->
        SocketInboundRoute.raw(event) { raw ->
            TogetherWire.inbound(event, raw.asJson())?.let { SocketInboundRoute.run { _events.emitOrLog(event, it) } }
        }
    }

    suspend fun invite(toUserId: String, conversationId: String, attachmentId: String): TogetherInviteOutcome {
        if (!connected) return TogetherInviteOutcome.Offline
        return TogetherInviteOutcome.read(ack(TogetherEvents.INVITE, TogetherWire.invitePayload(toUserId, conversationId, attachmentId)))
    }

    suspend fun join(sessionId: String): TogetherJoinOutcome {
        if (!connected) return TogetherJoinOutcome.Offline
        return TogetherJoinOutcome.read(ack(TogetherEvents.JOIN, TogetherWire.sessionPayload(sessionId)))
    }

    /** L'état que le serveur a retenu, ou `null` (refus, socket tombée) : la séance garde alors l'état précédent. */
    suspend fun sync(sessionId: String, playing: Boolean, positionMs: Double): TogetherPlayback? {
        if (!connected) return null
        return TogetherWire.syncAck(ack(TogetherEvents.SYNC, TogetherWire.syncPayload(sessionId, playing, positionMs)))
    }

    /** Quitter, refuser ou annuler : un seul geste côté serveur, sans attendre son accusé. */
    fun leave(sessionId: String) {
        if (connected) socketManager.emit(TogetherEvents.LEAVE, TogetherWire.sessionPayload(sessionId).asJsonObject())
    }

    private val connected: Boolean get() = socketManager.connectionState.value == SocketConnectionState.CONNECTED

    /** L'accusé brut, ou `null` passé [ACK_TIMEOUT_MS] — que chaque lecteur rend « hors ligne ». */
    private suspend fun ack(event: String, payload: JsonObject): JsonElement? = withTimeoutOrNull(ACK_TIMEOUT_MS) {
        suspendCancellableCoroutine<JSONObject?> { continuation ->
            socketManager.emit(event, payload.asJsonObject()) { args ->
                if (continuation.isActive) continuation.resume(args.firstOrNull() as? JSONObject)
            }
        }
    }?.asJson()

    internal companion object {
        /** 8 s, comme le web et iOS : au-delà, la socket est tenue pour tombée. */
        const val ACK_TIMEOUT_MS: Long = 8_000L

        private fun JSONObject.asJson(): JsonElement? = runCatching { Json.parseToJsonElement(toString()) }.getOrNull()

        private fun JsonObject.asJsonObject(): JSONObject = JSONObject(toString())
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface TogetherSocketModule {
    @Binds
    @IntoSet
    fun bindRealtime(socket: TogetherSocket): RealtimeBinding
}
