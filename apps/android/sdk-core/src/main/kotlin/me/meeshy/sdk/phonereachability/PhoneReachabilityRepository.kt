package me.meeshy.sdk.phonereachability

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
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityAnnouncement
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityEvent
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityRoster
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityRosterSnapshot
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PhoneReachabilityApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.PhoneReachabilitySocketEventsManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager

/**
 * Une annonce à faire défiler dans la SyncPill : la passerelle ne l'envoie que si mon canal est `socket`.
 * [unreachableSinceMillis] porte le « depuis » d'une annonce d'injoignabilité (nul pour un retour).
 */
data class PhoneReachabilityNotice(
    val userId: String,
    val announcement: PhoneReachabilityAnnouncement,
    val unreachableSinceMillis: Long? = null,
)

/** Ce que l'interface lit des téléphones injoignables des personnes qui me le partagent. */
interface PhoneReachabilityStore {
    /** Tous les états servis, par personne — vide quand tous les téléphones répondent. */
    val roster: StateFlow<PhoneReachabilityRoster>

    /** Les annonces, dans l'ordre du fil ; jamais rejouées à un nouvel abonné. */
    val notices: SharedFlow<PhoneReachabilityNotice>

    /** L'identité du compte connecté : mon propre état ne m'est jamais montré. */
    val viewerId: String?

    /** L'état d'une personne : `null` quand son téléphone répond (le glyphe est alors caché). */
    fun stateOf(userId: String?): Flow<PhoneReachabilityState?>

    /** Relit l'état d'une personne (`GET /relations/:userId/phone-reachability`) ; une panne ne change rien. */
    suspend fun refresh(userId: String)
}

/** Une lecture REST : [Served] fait foi (même `null`), [Unavailable] ne change rien. */
internal sealed interface PhoneReachabilityFetch {
    data class Served(val state: PhoneReachabilityState?) : PhoneReachabilityFetch
    data object Unavailable : PhoneReachabilityFetch
}

/** Où le dernier roster servi se range entre deux lancements ; une lecture ou une écriture qui échoue ne casse rien. */
interface PhoneReachabilityRosterCache {
    fun read(): PhoneReachabilityRosterSnapshot?

    /** `null` efface. */
    fun write(snapshot: PhoneReachabilityRosterSnapshot?)
}

/** Un fichier JSON privé de l'application : un seul compte à la fois, vidé au changement de compte. */
class FilePhoneReachabilityRosterCache(context: Context, private val json: Json) : PhoneReachabilityRosterCache {
    private val file = File(context.applicationContext.filesDir, FILE_NAME)

    override fun read(): PhoneReachabilityRosterSnapshot? = runCatching {
        if (!file.exists()) return null
        json.decodeFromString(PhoneReachabilityRosterSnapshot.serializer(), file.readText())
    }.getOrNull()

    override fun write(snapshot: PhoneReachabilityRosterSnapshot?) {
        runCatching {
            if (snapshot == null || snapshot.items.isEmpty()) {
                file.delete()
            } else {
                file.writeText(json.encodeToString(PhoneReachabilityRosterSnapshot.serializer(), snapshot))
            }
        }
    }

    private companion object {
        const val FILE_NAME = "meeshy_phone_reachability_roster.json"
    }
}

/** Les flux qui nourrissent le magasin — isolés pour que les tests les pilotent à la main. */
internal class PhoneReachabilitySources(
    val events: Flow<PhoneReachabilityEvent>,
    val connected: Flow<Boolean>,
    val snapshot: suspend () -> List<PhoneReachabilityState>?,
    val fetch: suspend (String) -> PhoneReachabilityFetch,
    val viewerId: () -> String?,
    val cache: PhoneReachabilityRosterCache,
    val now: () -> Long,
)

/**
 * LE TÉLÉPHONE INJOIGNABLE, CÔTÉ LECTEUR (#18737) — le branchement de [PhoneReachabilityRoster], patron de
 * `BatteryRepository` (#14147).
 *
 * `phone:unreachable` / `phone:reachable` s'appliquent dans l'ordre du fil ; à chaque socket accrochée, le rattrapage
 * (`GET /relations/phone-reachability`) fait foi, sauf pour les personnes qu'un événement a touchées depuis.
 * CACHE-FIRST : le dernier roster servi est rangé par compte (borné au TTL de 72 h) et se peint dès la construction ;
 * le rattrapage le remplace ensuite. La déconnexion ou le changement de compte vident tout, cache compris ([clear]).
 */
@Singleton
class PhoneReachabilityRepository internal constructor(
    private val sources: PhoneReachabilitySources,
    dispatcher: CoroutineDispatcher,
) : PhoneReachabilityStore, PerAccountCache {

    @Inject
    constructor(
        @ApplicationContext context: Context,
        api: PhoneReachabilityApi,
        sockets: PhoneReachabilitySocketEventsManager,
        socketManager: SocketManager,
        sessionRepository: SessionRepository,
        json: Json,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ) : this(
        PhoneReachabilitySources(
            events = sockets.events,
            connected = socketManager.connectionState.map { it == SocketConnectionState.CONNECTED },
            snapshot = { (apiCall { api.snapshot() } as? NetworkResult.Success)?.data?.served(json) },
            fetch = { userId ->
                when (val result = apiCall { api.stateOf(userId) }) {
                    is NetworkResult.Success -> PhoneReachabilityFetch.Served(result.data.state?.served())
                    is NetworkResult.Failure -> PhoneReachabilityFetch.Unavailable
                }
            },
            viewerId = { sessionRepository.currentUserId },
            cache = FilePhoneReachabilityRosterCache(context, json),
            now = System::currentTimeMillis,
        ),
        dispatcher,
    )

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val _roster = MutableStateFlow(restored())
    override val roster: StateFlow<PhoneReachabilityRoster> = _roster.asStateFlow()
    private val _notices = MutableSharedFlow<PhoneReachabilityNotice>(extraBufferCapacity = NOTICE_BUFFER)
    override val notices: SharedFlow<PhoneReachabilityNotice> = _notices.asSharedFlow()

    override val viewerId: String? get() = sources.viewerId()

    init {
        scope.launch { sources.events.collect(::receive) }
        scope.launch { sources.connected.distinctUntilChanged().filter { it }.collect { launch { catchUp() } } }
        scope.launch { roster.map { it.byUser }.distinctUntilChanged().collect(::persist) }
    }

    override fun stateOf(userId: String?): Flow<PhoneReachabilityState?> =
        roster.map { it.stateOf(userId) }.distinctUntilChanged()

    override suspend fun refresh(userId: String) {
        val viewer = sources.viewerId()
        val mark = _roster.value.mark
        val fetched = sources.fetch(userId) as? PhoneReachabilityFetch.Served ?: return
        if (sources.viewerId() != viewer) return
        reduce { roster ->
            if ((roster.touched[userId] ?: 0L) > mark) return@reduce roster
            fetched.state?.let(roster::receive) ?: roster.clear(userId)
        }
    }

    internal suspend fun catchUp() {
        val viewer = sources.viewerId()
        val mark = _roster.value.mark
        val items = sources.snapshot() ?: return
        if (sources.viewerId() != viewer) return
        reduce { it.reconcile(items, mark) }
    }

    override suspend fun clear() {
        reduce { PhoneReachabilityRoster() }
        sources.cache.write(null)
    }

    private fun restored(): PhoneReachabilityRoster =
        sources.cache.read()?.restore(sources.viewerId(), sources.now()) ?: PhoneReachabilityRoster()

    private fun persist(byUser: Map<String, PhoneReachabilityState>) {
        val viewer = sources.viewerId() ?: return
        sources.cache.write(PhoneReachabilityRosterSnapshot.of(viewer, PhoneReachabilityRoster(byUser = byUser)))
    }

    private fun receive(event: PhoneReachabilityEvent) {
        reduce { it.apply(event) }
        val announcement = event.announcement ?: return
        if (event.userId == sources.viewerId()) return
        val since = (event as? PhoneReachabilityEvent.Unreachable)?.state?.unreachableSinceMillis
        _notices.tryEmit(PhoneReachabilityNotice(event.userId, announcement, since))
    }

    private fun reduce(transition: (PhoneReachabilityRoster) -> PhoneReachabilityRoster) {
        synchronized(_roster) { _roster.value = transition(_roster.value) }
    }

    private companion object {
        const val NOTICE_BUFFER = 16
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PhoneReachabilityStoreModule {
    @Binds
    fun bindStore(repository: PhoneReachabilityRepository): PhoneReachabilityStore

    @Binds
    @IntoSet
    fun bindAccountCache(repository: PhoneReachabilityRepository): PerAccountCache
}
