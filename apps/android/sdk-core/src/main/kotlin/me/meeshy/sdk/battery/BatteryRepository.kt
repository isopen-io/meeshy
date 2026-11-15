package me.meeshy.sdk.battery

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
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
import me.meeshy.sdk.model.battery.BatteryAnnouncement
import me.meeshy.sdk.model.battery.BatteryEvent
import me.meeshy.sdk.model.battery.BatteryRoster
import me.meeshy.sdk.model.battery.BatteryState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.BatteryApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.BatterySocketEventsManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager

/** Une annonce à faire défiler dans la SyncPill : la passerelle ne l'envoie que si mon canal pour ce palier est `socket`. */
data class BatteryNotice(val userId: String, val announcement: BatteryAnnouncement)

/** Ce que l'interface lit de la batterie des personnes qui me la partagent. */
interface BatteryStore {
    /** Tous les états servis, par personne — vide hors épisode. */
    val roster: StateFlow<BatteryRoster>

    /** Les annonces, dans l'ordre du fil ; jamais rejouées à un nouvel abonné. */
    val notices: SharedFlow<BatteryNotice>

    /** L'état d'une personne : `null` hors épisode (l'icône est alors cachée). */
    fun stateOf(userId: String?): Flow<BatteryState?>

    /** Relit l'état d'une personne (`GET /relations/:userId/battery`) ; une panne ne change rien. */
    suspend fun refresh(userId: String)
}

/** Une lecture REST : [Served] fait foi (même `null`), [Unavailable] ne change rien. */
internal sealed interface BatteryFetch {
    data class Served(val state: BatteryState?) : BatteryFetch
    data object Unavailable : BatteryFetch
}

/** Les flux qui nourrissent le magasin — isolés pour que les tests les pilotent à la main. */
internal class BatterySources(
    val events: Flow<BatteryEvent>,
    val connected: Flow<Boolean>,
    val snapshot: suspend () -> List<BatteryState>?,
    val fetch: suspend (String) -> BatteryFetch,
    val viewerId: () -> String?,
)

/**
 * LA BATTERIE DES PROCHES, CÔTÉ LECTEUR (#14147) — le branchement de [BatteryRoster].
 *
 * `battery:changed` / `battery:cleared` s'appliquent dans l'ordre du fil ; à chaque socket accrochée, le rattrapage
 * (`GET /relations/battery`) fait foi, sauf pour les personnes qu'un événement a touchées depuis. Le magasin tient en
 * mémoire : l'icône s'affiche dès que l'état est connu, sans jamais d'attente sur un état déjà tenu. La déconnexion ou
 * le changement de compte vident tout ([clear]).
 */
@Singleton
class BatteryRepository internal constructor(
    private val sources: BatterySources,
    dispatcher: CoroutineDispatcher,
) : BatteryStore, PerAccountCache {

    @Inject
    constructor(
        api: BatteryApi,
        sockets: BatterySocketEventsManager,
        socketManager: SocketManager,
        sessionRepository: SessionRepository,
        json: Json,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ) : this(
        BatterySources(
            events = sockets.events,
            connected = socketManager.connectionState.map { it == SocketConnectionState.CONNECTED },
            snapshot = { (apiCall { api.snapshot() } as? NetworkResult.Success)?.data?.served(json) },
            fetch = { userId ->
                when (val result = apiCall { api.stateOf(userId) }) {
                    is NetworkResult.Success -> BatteryFetch.Served(result.data.state?.served())
                    is NetworkResult.Failure -> BatteryFetch.Unavailable
                }
            },
            viewerId = { sessionRepository.currentUserId },
        ),
        dispatcher,
    )

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val _roster = MutableStateFlow(BatteryRoster())
    override val roster: StateFlow<BatteryRoster> = _roster.asStateFlow()
    private val _notices = MutableSharedFlow<BatteryNotice>(extraBufferCapacity = NOTICE_BUFFER)
    override val notices: SharedFlow<BatteryNotice> = _notices.asSharedFlow()

    init {
        scope.launch { sources.events.collect(::receive) }
        scope.launch { sources.connected.distinctUntilChanged().filter { it }.collect { launch { catchUp() } } }
    }

    override fun stateOf(userId: String?): Flow<BatteryState?> =
        roster.map { it.stateOf(userId) }.distinctUntilChanged()

    override suspend fun refresh(userId: String) {
        val viewer = sources.viewerId()
        val mark = _roster.value.mark
        val fetched = sources.fetch(userId) as? BatteryFetch.Served ?: return
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
        reduce { BatteryRoster() }
    }

    private fun receive(event: BatteryEvent) {
        reduce { it.apply(event) }
        val announcement = when (event) {
            is BatteryEvent.Changed -> event.announcement
            is BatteryEvent.Cleared -> event.announcement
        } ?: return
        val userId = when (event) {
            is BatteryEvent.Changed -> event.state.userId
            is BatteryEvent.Cleared -> event.userId
        }
        _notices.tryEmit(BatteryNotice(userId, announcement))
    }

    private fun reduce(transition: (BatteryRoster) -> BatteryRoster) {
        synchronized(_roster) { _roster.value = transition(_roster.value) }
    }

    private companion object {
        const val NOTICE_BUFFER = 16
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface BatteryStoreModule {
    @Binds
    fun bindStore(repository: BatteryRepository): BatteryStore

    @Binds
    @IntoSet
    fun bindAccountCache(repository: BatteryRepository): PerAccountCache
}
