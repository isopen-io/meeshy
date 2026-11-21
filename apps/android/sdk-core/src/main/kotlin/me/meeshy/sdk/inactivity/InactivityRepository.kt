package me.meeshy.sdk.inactivity

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.model.inactivity.InactivityAlertState
import me.meeshy.sdk.model.inactivity.InactivityAnnouncement
import me.meeshy.sdk.model.inactivity.InactivityEvent
import me.meeshy.sdk.model.inactivity.InactivityRoster
import me.meeshy.sdk.model.inactivity.InactivityRosterSnapshot
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.InactivityApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.InactivitySocketEventsManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager

/** Une annonce à faire défiler dans la SyncPill : « Jacques n'a pas répondu… » ou « Jacques va bien ». */
data class InactivityNotice(val userId: String, val announcement: InactivityAnnouncement)

/** Ce que l'interface lit des alertes d'inactivité des personnes qui me les partagent. */
interface InactivityStore {
    /** Toutes les alertes servies, par personne — vide quand personne n'est en alerte. */
    val roster: StateFlow<InactivityRoster>

    /** Les annonces, dans l'ordre du fil ; jamais rejouées à un nouvel abonné. */
    val notices: SharedFlow<InactivityNotice>

    /** L'identité du compte connecté : mon propre état ne m'est jamais montré. */
    val viewerId: String?

    /** L'alerte d'une personne : `null` hors alerte (rien n'est alors montré). */
    fun stateOf(userId: String?): Flow<InactivityAlertState?>
}

/** Où le dernier roster servi se range entre deux lancements ; une lecture ou une écriture qui échoue ne casse rien. */
interface InactivityRosterCache {
    fun read(): InactivityRosterSnapshot?

    /** `null` efface. */
    fun write(snapshot: InactivityRosterSnapshot?)
}

/** Un fichier JSON privé de l'application : un seul compte à la fois, vidé au changement de compte. */
class FileInactivityRosterCache(context: Context, private val json: Json) : InactivityRosterCache {
    private val file = File(context.applicationContext.filesDir, FILE_NAME)

    override fun read(): InactivityRosterSnapshot? = runCatching {
        if (!file.exists()) return null
        json.decodeFromString(InactivityRosterSnapshot.serializer(), file.readText())
    }.getOrNull()

    override fun write(snapshot: InactivityRosterSnapshot?) {
        runCatching {
            if (snapshot == null || snapshot.items.isEmpty()) {
                file.delete()
            } else {
                file.writeText(json.encodeToString(InactivityRosterSnapshot.serializer(), snapshot))
            }
        }
    }

    private companion object {
        const val FILE_NAME = "meeshy_inactivity_roster.json"
    }
}

/** Les flux qui nourrissent le magasin — isolés pour que les tests les pilotent à la main. */
internal class InactivitySources(
    val events: Flow<InactivityEvent>,
    val connected: Flow<Boolean>,
    val snapshot: suspend () -> List<InactivityAlertState>?,
    val viewerId: () -> String?,
    val cache: InactivityRosterCache,
    val now: () -> Long,
)

/**
 * LA VÉRIFICATION D'INACTIVITÉ, CÔTÉ SANG (#18738) — le branchement de [InactivityRoster], patron de
 * `PhoneReachabilityRepository` (#18737).
 *
 * `inactivity:alert` / `inactivity:cleared` s'appliquent dans l'ordre du fil ; à chaque socket accrochée, le rattrapage
 * (`GET /relations/inactivity`) fait foi, sauf pour les personnes qu'un événement a touchées depuis. CACHE-FIRST : le
 * dernier roster servi est rangé par compte (borné au TTL de 72 h) et se peint dès la construction. La déconnexion ou le
 * changement de compte vident tout, cache compris ([clear]).
 */
@Singleton
class InactivityRepository internal constructor(
    private val sources: InactivitySources,
    dispatcher: CoroutineDispatcher,
) : InactivityStore, PerAccountCache {

    @Inject
    constructor(
        @ApplicationContext context: Context,
        api: InactivityApi,
        sockets: InactivitySocketEventsManager,
        socketManager: SocketManager,
        sessionRepository: SessionRepository,
        json: Json,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ) : this(
        InactivitySources(
            events = sockets.events,
            connected = socketManager.connectionState.map { it == SocketConnectionState.CONNECTED },
            snapshot = { (apiCall { api.snapshot() } as? NetworkResult.Success)?.data?.served(json) },
            viewerId = { sessionRepository.currentUserId },
            cache = FileInactivityRosterCache(context, json),
            now = System::currentTimeMillis,
        ),
        dispatcher,
    )

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val _roster = MutableStateFlow(restored())
    override val roster: StateFlow<InactivityRoster> = _roster.asStateFlow()
    private val _notices = MutableSharedFlow<InactivityNotice>(extraBufferCapacity = NOTICE_BUFFER)
    override val notices: SharedFlow<InactivityNotice> = _notices.asSharedFlow()

    override val viewerId: String? get() = sources.viewerId()

    init {
        scope.launch { sources.events.collect(::receive) }
        scope.launch { sources.connected.distinctUntilChanged().filter { it }.collect { launch { catchUp() } } }
        scope.launch { roster.map { it.byUser }.distinctUntilChanged().collect(::persist) }
    }

    override fun stateOf(userId: String?): Flow<InactivityAlertState?> =
        roster.map { it.stateOf(userId) }.distinctUntilChanged()

    internal suspend fun catchUp() {
        val viewer = sources.viewerId()
        val mark = _roster.value.mark
        val items = sources.snapshot() ?: return
        if (sources.viewerId() != viewer) return
        reduce { it.reconcile(items, mark) }
    }

    override suspend fun clear() {
        reduce { InactivityRoster() }
        sources.cache.write(null)
    }

    private fun restored(): InactivityRoster =
        sources.cache.read()?.restore(sources.viewerId(), sources.now()) ?: InactivityRoster()

    private fun persist(byUser: Map<String, InactivityAlertState>) {
        val viewer = sources.viewerId() ?: return
        sources.cache.write(InactivityRosterSnapshot.of(viewer, InactivityRoster(byUser = byUser)))
    }

    private fun receive(event: InactivityEvent) {
        reduce { it.apply(event) }
        val announcement = event.announcement ?: return
        if (event.userId == sources.viewerId()) return
        _notices.tryEmit(InactivityNotice(event.userId, announcement))
    }

    private fun reduce(transition: (InactivityRoster) -> InactivityRoster) {
        synchronized(_roster) { _roster.value = transition(_roster.value) }
    }

    private companion object {
        const val NOTICE_BUFFER = 16
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface InactivityStoreModule {
    @Binds
    fun bindStore(repository: InactivityRepository): InactivityStore

    @Binds
    @IntoSet
    fun bindAccountCache(repository: InactivityRepository): PerAccountCache
}
