package me.meeshy.sdk.socket

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.model.presence.ConversationViewers
import me.meeshy.sdk.model.presence.VIEWING_ACTIVITY_THROTTLE_MS
import me.meeshy.sdk.model.presence.ViewingChange
import me.meeshy.sdk.model.presence.ViewingEvent
import me.meeshy.sdk.model.presence.ViewingSnapshot
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Branche « est dans la conversation » sur la session socket (miroir de `PresenceManager.applyViewing`
 * et du câblage de `ConversationViewingReporter`, iOS) :
 *
 * - REÇOIT `viewing:start/stop/activity/snapshot` et tient [viewers], l'état des pairs ICI ;
 *   la visibilité reste décidée par la passerelle, aucun état local ne prolonge ce qu'elle sert ;
 * - PILOTE le [ConversationViewingReporter] : premier plan du process, ré-annonce à chaque
 *   (re)connexion (qui jette aussi les pairs — le serveur ré-annonce les siens), battement de
 *   l'activité tant qu'une conversation est annoncée.
 *
 * Les écouteurs se posent UNE fois sur [SocketManager] (qui les rejoue sur chaque socket) ; le
 * drapeau [active] les rend inertes hors session.
 */
@Singleton
class ConversationViewingBinding @Inject constructor(
    private val socketManager: SocketManager,
    private val reporter: ConversationViewingReporter,
    private val appState: AppStatePresenceReporter,
    private val json: Json,
    @DefaultDispatcher private val dispatcher: CoroutineDispatcher,
) : RealtimeBinding {

    private val lock = Any()
    private val _viewers = MutableStateFlow(ConversationViewers())

    /** Qui est ICI, dans quelle conversation — source du point « ici » des avatars. */
    val viewers: StateFlow<ConversationViewers> = _viewers.asStateFlow()

    private var active = false
    private var listening = false
    private var scope: CoroutineScope? = null
    private val rests = HashMap<String, Job>()

    /** Le temps qu'un pair reste actif après son dernier `viewing:activity` (jumeau d'`ACTIVITY_HOLD_MS`). */
    internal var activityHoldMillis: Long = ACTIVITY_HOLD_MS

    override fun attach() {
        synchronized(lock) {
            if (active) return
            active = true
            listenOnce()
            val session = CoroutineScope(SupervisorJob() + dispatcher)
            scope = session
            session.launch { socketManager.connected.collect { onSessionStarted() } }
            session.launch { appState.foreground.collect { it?.let(reporter::setForeground) } }
            session.launch {
                reporter.announced.collectLatest { id ->
                    if (id == null) return@collectLatest
                    while (true) {
                        delay(VIEWING_ACTIVITY_THROTTLE_MS)
                        reporter.heartbeat()
                    }
                }
            }
        }
        if (socketManager.isConnected) reporter.onSocketConnected()
    }

    override fun detach() {
        synchronized(lock) {
            active = false
            scope?.cancel()
            scope = null
            rests.clear()
        }
        _viewers.value = ConversationViewers()
    }

    private fun onSessionStarted() {
        synchronized(lock) {
            rests.values.forEach(Job::cancel)
            rests.clear()
        }
        _viewers.update { it.applying(ViewingEvent.SessionStarted) }
        reporter.onSocketConnected()
    }

    private fun listenOnce() {
        if (listening) return
        listening = true
        socketManager.on(SocketEventNames.VIEWING_START) { args -> decode<ViewingChange>(args)?.let { apply(ViewingEvent.Arrived(it)) } }
        socketManager.on(SocketEventNames.VIEWING_STOP) { args -> decode<ViewingChange>(args)?.let { apply(ViewingEvent.Left(it)) } }
        socketManager.on(SocketEventNames.VIEWING_ACTIVITY) { args -> decode<ViewingChange>(args)?.let { apply(ViewingEvent.Active(it)) } }
        socketManager.on(SocketEventNames.VIEWING_SNAPSHOT) { args -> decode<ViewingSnapshot>(args)?.let { apply(ViewingEvent.Snapshot(it)) } }
    }

    private inline fun <reified T> decode(args: Array<Any>): T? =
        runCatching {
            val raw = args.firstOrNull() as? JSONObject ?: return null
            json.decodeFromString<T>(raw.toString())
        }.onFailure { Timber.e(it, "viewing decode error: %s", T::class.simpleName) }.getOrNull()

    private fun apply(event: ViewingEvent) {
        try {
            synchronized(lock) {
                if (!active) return
                when (event) {
                    is ViewingEvent.Active -> scheduleRest(event.change)
                    is ViewingEvent.Left -> rests.remove(restKey(event.change))?.cancel()
                    else -> Unit
                }
            }
            _viewers.update { it.applying(event) }
        } catch (failure: Exception) {
            Timber.e(failure, "viewing event en echec")
        }
    }

    /** Chaque activité repousse l'extinction : le point pulse tant que le pair continue. */
    private fun scheduleRest(change: ViewingChange) {
        val key = restKey(change)
        rests.remove(key)?.cancel()
        val session = scope ?: return
        rests[key] = session.launch {
            delay(activityHoldMillis)
            synchronized(lock) { rests.remove(key) }
            _viewers.update { it.resting(change.userId, change.conversationId) }
        }
    }

    private fun restKey(change: ViewingChange) = "${change.conversationId}\u0000${change.userId}"

    internal companion object {
        const val ACTIVITY_HOLD_MS: Long = 4_000L
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ConversationViewingBindingModule {
    @Binds
    @IntoSet
    fun bindsConversationViewingBinding(impl: ConversationViewingBinding): RealtimeBinding
}
