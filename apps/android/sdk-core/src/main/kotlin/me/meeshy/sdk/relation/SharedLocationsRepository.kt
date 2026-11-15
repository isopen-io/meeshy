package me.meeshy.sdk.relation

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
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.model.relation.SharedLocation
import me.meeshy.sdk.model.relation.SharedLocationBounds
import me.meeshy.sdk.model.relation.SharedLocationEndedEvent
import me.meeshy.sdk.model.relation.SharedLocationEntry
import me.meeshy.sdk.model.relation.SharedLocationsState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.RelationsApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.RelationSocketEventsManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager

/** Ce que la carte lit des positions qu'on me partage, et le rattrapage qu'elle demande pour son emprise. */
interface SharedLocationsGateway {
    /** Par personne, la position servie et son échéance ; jamais rien de plus précis que ce que l'émetteur m'a donné. */
    val byUser: StateFlow<Map<String, SharedLocationEntry>>

    /** `GET /relations/locations?bbox=` : fait foi dans [bounds] (`null` = toute la carte). Une panne ne change rien. */
    suspend fun catchUp(bounds: SharedLocationBounds?)
}

/** Les flux qui nourrissent le magasin — isolés pour que les tests les pilotent à la main. */
internal class SharedLocationSources(
    val changed: Flow<SharedLocation>,
    val ended: Flow<SharedLocationEndedEvent>,
    val connected: Flow<Boolean>,
    val snapshot: suspend (SharedLocationBounds?) -> List<SharedLocation>?,
    val viewerId: () -> String?,
)

/**
 * LES POSITIONS QU'ON ME PARTAGE, SUR ANDROID (#16985, réception de #14109) — le branchement de [SharedLocationsState],
 * iso `SharedLocationsLive.swift` (#16983) et `shared-locations-live.ts` (#16984).
 *
 * `location:share-changed` et `location:share-ended` sont appliqués dans l'ordre du fil ; à chaque socket accrochée, le
 * rattrapage de toute la carte fait foi ; un minuteur éteint chaque position à son échéance, sans événement du serveur.
 * Rien n'est écrit sur le disque, et la déconnexion ou le changement de compte vident tout ([clear]).
 */
@Singleton
class SharedLocationsRepository internal constructor(
    private val sources: SharedLocationSources,
    dispatcher: CoroutineDispatcher,
    private val now: () -> Long,
) : SharedLocationsGateway, PerAccountCache {

    @Inject
    constructor(
        api: RelationsApi,
        sockets: RelationSocketEventsManager,
        socketManager: SocketManager,
        sessionRepository: SessionRepository,
        json: Json,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ) : this(
        SharedLocationSources(
            changed = sockets.sharedLocationChanged,
            ended = sockets.sharedLocationEnded,
            connected = socketManager.connectionState.map { it == SocketConnectionState.CONNECTED },
            snapshot = { bounds ->
                (apiCall { api.sharedLocations(bounds?.queryValue) } as? NetworkResult.Success)?.data?.served(json)
            },
            viewerId = { sessionRepository.currentUserId },
        ),
        dispatcher,
        System::currentTimeMillis,
    )

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val state = MutableStateFlow(SharedLocationsState())
    private val _byUser = MutableStateFlow<Map<String, SharedLocationEntry>>(emptyMap())
    override val byUser: StateFlow<Map<String, SharedLocationEntry>> = _byUser.asStateFlow()

    init {
        scope.launch { sources.changed.collect { location -> reduce { it.receive(location, sources.viewerId(), now()) } } }
        scope.launch { sources.ended.collect { event -> reduce { it.clear(event.userId) } } }
        scope.launch {
            sources.connected.distinctUntilChanged().filter { it }.collect { launch { catchUp(null) } }
        }
        scope.launch {
            state.map { it.nextDeadlineMillis }.distinctUntilChanged().collectLatest { deadline ->
                if (deadline == null) return@collectLatest
                delay((deadline - now()).coerceAtLeast(0L))
                reduce { it.expireDue(now()) }
            }
        }
    }

    override suspend fun catchUp(bounds: SharedLocationBounds?) {
        val viewer = sources.viewerId()
        val mark = state.value.mark
        val items = sources.snapshot(bounds) ?: return
        if (sources.viewerId() != viewer) return
        reduce { it.reconcile(items, mark, bounds, viewer, now()) }
    }

    override suspend fun clear() {
        reduce { SharedLocationsState(arrivals = it.arrivals) }
    }

    private fun reduce(transition: (SharedLocationsState) -> SharedLocationsState) {
        synchronized(state) {
            val next = transition(state.value)
            state.value = next
            _byUser.value = next.byUser
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SharedLocationsModule {
    @Binds
    fun bindGateway(repository: SharedLocationsRepository): SharedLocationsGateway

    @Binds
    @IntoSet
    fun bindAccountCache(repository: SharedLocationsRepository): PerAccountCache
}
