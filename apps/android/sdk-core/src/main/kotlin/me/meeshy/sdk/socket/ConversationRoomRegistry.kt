package me.meeshy.sdk.socket

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.conversation.ParticipantCacheRepository
import me.meeshy.sdk.model.ConversationJoinErrorEvent
import me.meeshy.sdk.model.socket.RoomsToRejoin
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les salles de conversation que la socket a rejointes (miroir de `joinConversation` / `leaveConversation` et de la
 * boucle de rejointe du `.connect` de `MessageSocketManager`, iOS).
 *
 * L'ensemble est MÉMORISÉ même hors connexion et rejoué à chaque connexion dans l'ordre de [RoomsToRejoin] : la
 * conversation active d'abord, les autres fenêtres ouvertes, puis le reste. Le serveur oublie les salles à la
 * déconnexion ; la mémoire du client est donc la seule source de ce qu'il faut rejoindre. `conversation:join` est
 * ré-émis sans condition à chaque ouverture : c'est le seul aller-retour qui rend `join-error`.
 */
@Singleton
class ConversationRoomRegistry @Inject constructor(
    private val socketManager: SocketManager,
    private val participants: ParticipantCacheRepository,
    private val json: Json,
    @DefaultDispatcher private val dispatcher: CoroutineDispatcher,
) : RealtimeBinding {

    private val lock = Any()
    private val joined = LinkedHashSet<String>()
    private var active: String? = null
    private var open: Set<String> = emptySet()
    private var attached = false
    private var listening = false
    private var scope: CoroutineScope? = null
    private val _refusals = MutableSharedFlow<ConversationJoinErrorEvent>(extraBufferCapacity = 8)

    /** Les refus de jointure du serveur, à montrer sans interrompre (la feuille de la conversation les lit). */
    val refusals: SharedFlow<ConversationJoinErrorEvent> = _refusals.asSharedFlow()

    /** Les salles mémorisées. */
    val joinedRooms: Set<String> get() = synchronized(lock) { joined.toSet() }

    /** La priorité de rejointe : posée par le registre d'ouverture à chaque changement. */
    fun notePriority(activeConversationId: String?, openConversationIds: Set<String>) {
        synchronized(lock) {
            active = activeConversationId
            open = openConversationIds
        }
    }

    fun join(conversationId: String) {
        synchronized(lock) { joined.add(conversationId) }
        emitIfConnected(SocketEventNames.CONVERSATION_JOIN, conversationId)
    }

    fun leave(conversationId: String) {
        val known = synchronized(lock) { joined.remove(conversationId) }
        if (known) emitIfConnected(SocketEventNames.CONVERSATION_LEAVE, conversationId)
    }

    override fun attach() {
        synchronized(lock) {
            if (attached) return
            attached = true
            listenOnce()
            val session = CoroutineScope(SupervisorJob() + dispatcher)
            scope = session
            session.launch { socketManager.connected.collect { rejoinAll() } }
        }
        if (socketManager.isConnected) rejoinAll()
    }

    override fun detach() {
        synchronized(lock) {
            attached = false
            scope?.cancel()
            scope = null
            joined.clear()
        }
    }

    private fun rejoinAll() {
        val rooms = synchronized(lock) { RoomsToRejoin.order(joined, active, open) }
        rooms.forEach { emitIfConnected(SocketEventNames.CONVERSATION_JOIN, it) }
    }

    private fun emitIfConnected(event: String, conversationId: String) {
        if (!socketManager.isConnected) return
        try {
            socketManager.emit(event, JSONObject().put("conversationId", conversationId))
        } catch (failure: Exception) {
            Timber.w(failure, "%s: émission en échec", event)
        }
    }

    private fun listenOnce() {
        if (listening) return
        listening = true
        socketManager.on(SocketEventNames.CONVERSATION_JOINED) { Timber.d("%s", SocketEventNames.CONVERSATION_JOINED) }
        socketManager.on(SocketEventNames.CONVERSATION_LEFT) { Timber.d("%s", SocketEventNames.CONVERSATION_LEFT) }
        socketManager.on(SocketEventNames.CONVERSATION_JOIN_ERROR) { args -> onJoinError(args) }
    }

    private fun onJoinError(args: Array<Any>) {
        try {
            val raw = args.firstOrNull() as? JSONObject ?: return
            val event = json.decodeFromString<ConversationJoinErrorEvent>(raw.toString())
            val session = synchronized(lock) {
                if (!attached) return
                if (event.isMembershipDenied) joined.remove(event.conversationId)
                scope
            }
            session?.launch { participants.invalidate(event.conversationId) }
            _refusals.tryEmit(event)
        } catch (failure: Exception) {
            Timber.w(failure, "%s: décodage en échec", SocketEventNames.CONVERSATION_JOIN_ERROR)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ConversationRoomRegistryModule {
    @Binds
    @IntoSet
    fun bindsConversationRoomRegistry(impl: ConversationRoomRegistry): RealtimeBinding
}
