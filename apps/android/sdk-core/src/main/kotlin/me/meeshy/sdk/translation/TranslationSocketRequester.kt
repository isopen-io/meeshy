package me.meeshy.sdk.translation

import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.PendingTranslationRequest
import me.meeshy.sdk.model.TranslationRequestBuffer
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import org.json.JSONObject
import timber.log.Timber

/** Ce dont la demande a besoin de la socket : savoir si elle porte, émettre, et dire quand elle (re)devient connectée. */
interface TranslationSocketLink {
    val isConnected: Boolean
    val connections: Flow<Boolean>
    fun emit(messageId: String, targetLanguage: String)
}

/** Où est partie la demande : sur la socket (la réponse arrive par `message:translation`) ou par le REST de repli. */
enum class TranslationRequestRoute { SOCKET, REST_FALLBACK }

/**
 * La demande de traduction d'un message par la socket (`translation:request`), avec un tampon qui ne perd rien
 * à la déconnexion (miroir de `requestTranslation` / `flushBufferedTranslationRequests`, iOS). La demande est
 * TOUJOURS mise au tampon : le tampon est borné (50), périssable (60 s) et dédoublonné, et la passerelle répond
 * de façon idempotente — la rejouer à la connexion est inoffensif, et rattrape une réponse perdue en vol.
 * Socket indisponible : le REST `translate-blocking` prend le relais, le résultat est stocké par [restFallback].
 * Une passerelle ancienne ignore l'événement. Rien du contenu n'est émis : seulement l'identifiant et la langue.
 */
@Singleton
class TranslationSocketRequester internal constructor(
    private val link: TranslationSocketLink,
    private val restFallback: suspend (messageId: String, targetLanguage: String) -> Boolean,
    private val clock: CacheClock,
    private val scope: CoroutineScope,
) : RealtimeBinding {

    @Inject
    constructor(
        socketManager: SocketManager,
        messages: MessageRepository,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ) : this(
        SocketManagerLink(socketManager),
        { id, language -> messages.requestTranslation(id, language) },
        SystemCacheClock,
        CoroutineScope(SupervisorJob() + dispatcher),
    )

    private val buffer = AtomicReference(TranslationRequestBuffer())
    private var watcher: Job? = null

    /** `true` quand la demande est partie (socket) ou que le repli REST a stocké la traduction. */
    suspend fun request(messageId: String, targetLanguage: String): Pair<TranslationRequestRoute, Boolean> {
        if (messageId.isBlank() || targetLanguage.isBlank()) return TranslationRequestRoute.SOCKET to false
        buffer.updateAndGet { it.enqueue(PendingTranslationRequest(messageId, targetLanguage, clock.nowMillis())) }
        if (link.isConnected) {
            link.emit(messageId, targetLanguage)
            return TranslationRequestRoute.SOCKET to true
        }
        return TranslationRequestRoute.REST_FALLBACK to restFallback(messageId, targetLanguage)
    }

    /** Rejoue les demandes encore fraîches ; à appeler dès que la socket est (re)connectée. */
    fun flush() {
        val drained = buffer.getAndUpdate { TranslationRequestBuffer() }.drainFresh(clock.nowMillis()).first
        drained.forEach { link.emit(it.messageId, it.targetLanguage) }
    }

    internal fun pending(): List<PendingTranslationRequest> = buffer.get().pending

    override fun attach() {
        watcher?.cancel()
        watcher = scope.launch {
            link.connections.distinctUntilChanged().filter { it }.collect {
                try {
                    flush()
                } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                    Timber.w("Traduction: rejeu du tampon non applique (%s)", failure.javaClass.simpleName)
                }
            }
        }
    }

    override fun detach() {
        watcher?.cancel()
        watcher = null
    }
}

internal class SocketManagerLink(private val socketManager: SocketManager) : TranslationSocketLink {
    override val isConnected: Boolean get() = socketManager.isConnected
    override val connections: Flow<Boolean> = socketManager.connectionState.map { it == SocketConnectionState.CONNECTED }

    override fun emit(messageId: String, targetLanguage: String) {
        socketManager.emit(
            TranslationRequestBuffer.REQUEST_EVENT,
            JSONObject().put("messageId", messageId).put("targetLanguage", targetLanguage),
        )
    }
}
