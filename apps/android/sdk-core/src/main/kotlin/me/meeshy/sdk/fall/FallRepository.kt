package me.meeshy.sdk.fall

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
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.model.fall.FallClearedReason
import me.meeshy.sdk.model.fall.FallEvent
import me.meeshy.sdk.model.fall.FallRoster
import me.meeshy.sdk.model.fall.FallRosterSnapshot
import me.meeshy.sdk.model.fall.FallState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.FallApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.FallSocketEventsManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager

/** Une annonce à faire défiler : « Une chute a été détectée sur la montre d'Awa », ou « Awa va bien ». */
data class FallNotice(val userId: String, val kind: Kind, val atMillis: Long) {
    enum class Kind { DETECTED, RESPONDED }
}

/** Ce que l'interface lit des chutes des personnes qui me les partagent. */
interface FallStore {
    val roster: StateFlow<FallRoster>

    /** Les annonces, dans l'ordre du fil ; jamais rejouées à un nouvel abonné. */
    val notices: SharedFlow<FallNotice>

    val viewerId: String?

    /** La chute en cours d'une personne : `null` hors épisode ou une fois `expiresAt` passé. */
    fun stateOf(userId: String?): Flow<FallState?>

    /** La levée poussée (`safety_alert_cleared`) : retire l'état comme `fall:cleared`. */
    fun clearFromPush(userId: String)
}

interface FallRosterCache {
    fun read(): FallRosterSnapshot?

    /** `null` efface. */
    fun write(snapshot: FallRosterSnapshot?)
}

/** Un fichier JSON privé : un seul compte à la fois, SANS position (la forme rangée n'en a pas). */
class FileFallRosterCache(context: Context, private val json: Json) : FallRosterCache {
    private val file = File(context.applicationContext.filesDir, FILE_NAME)

    override fun read(): FallRosterSnapshot? = runCatching {
        if (!file.exists()) return null
        json.decodeFromString(FallRosterSnapshot.serializer(), file.readText())
    }.getOrNull()

    override fun write(snapshot: FallRosterSnapshot?) {
        runCatching {
            if (snapshot == null || snapshot.items.isEmpty()) {
                file.delete()
            } else {
                file.writeText(json.encodeToString(FallRosterSnapshot.serializer(), snapshot))
            }
        }
    }

    private companion object {
        const val FILE_NAME = "meeshy_fall_roster.json"
    }
}

internal class FallSources(
    val events: Flow<FallEvent>,
    val connected: Flow<Boolean>,
    val snapshot: suspend () -> List<FallState>?,
    val viewerId: () -> String?,
    val cache: FallRosterCache,
    val now: () -> Long,
    /** L'horloge qui fait tomber un épisode expiré à l'écran : une minute suffit. */
    val ticks: Flow<Unit> = minuteTicks(),
)

private const val MINUTE_MS = 60_000L

private fun minuteTicks(): Flow<Unit> = flow {
    while (true) {
        delay(MINUTE_MS)
        emit(Unit)
    }
}

/**
 * LA CHUTE DÉTECTÉE, CÔTÉ SANG (#18748) — le branchement de [FallRoster], patron d'`InactivityRepository` (#18738).
 *
 * `fall:detected` / `fall:cleared` s'appliquent dans l'ordre du fil ; à chaque socket accrochée, le rattrapage
 * (`GET /relations/falls`) fait foi, sauf pour qui un événement a touché depuis. CACHE-FIRST : le dernier roster servi
 * est rangé par compte, SANS position, borné à `expiresAt`. La déconnexion ou le changement de compte vident tout.
 */
@Singleton
class FallRepository internal constructor(
    private val sources: FallSources,
    dispatcher: CoroutineDispatcher,
) : FallStore, PerAccountCache {

    @Inject
    constructor(
        @ApplicationContext context: Context,
        api: FallApi,
        sockets: FallSocketEventsManager,
        socketManager: SocketManager,
        sessionRepository: SessionRepository,
        json: Json,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ) : this(
        FallSources(
            events = sockets.events,
            connected = socketManager.connectionState.map { it == SocketConnectionState.CONNECTED },
            snapshot = { (apiCall { api.snapshot() } as? NetworkResult.Success)?.data?.served(json) },
            viewerId = { sessionRepository.currentUserId },
            cache = FileFallRosterCache(context, json),
            now = System::currentTimeMillis,
        ),
        dispatcher,
    )

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val _roster = MutableStateFlow(restored())
    override val roster: StateFlow<FallRoster> = _roster.asStateFlow()
    private val _notices = MutableSharedFlow<FallNotice>(extraBufferCapacity = NOTICE_BUFFER)
    override val notices: SharedFlow<FallNotice> = _notices.asSharedFlow()

    override val viewerId: String? get() = sources.viewerId()

    init {
        scope.launch { sources.events.collect(::receive) }
        scope.launch { sources.connected.distinctUntilChanged().filter { it }.collect { launch { catchUp() } } }
        scope.launch { roster.map { it.byUser }.distinctUntilChanged().collect(::persist) }
    }

    override fun stateOf(userId: String?): Flow<FallState?> =
        combine(roster, sources.ticks.onStart { emit(Unit) }) { current, _ -> current.stateOf(userId, sources.now()) }
            .distinctUntilChanged()

    override fun clearFromPush(userId: String) {
        reduce { it.apply(FallEvent.Cleared(userId, FallClearedReason.RESPONDED)) }
    }

    internal suspend fun catchUp() {
        val viewer = sources.viewerId()
        val mark = _roster.value.mark
        val items = sources.snapshot() ?: return
        if (sources.viewerId() != viewer) return
        reduce { it.reconcile(items.filter { item -> item.userId != viewer }, mark) }
    }

    override suspend fun clear() {
        reduce { FallRoster() }
        sources.cache.write(null)
    }

    private fun restored(): FallRoster = sources.cache.read()?.restore(sources.viewerId(), sources.now()) ?: FallRoster()

    private fun persist(byUser: Map<String, FallState>) {
        val viewer = sources.viewerId() ?: return
        sources.cache.write(FallRosterSnapshot.of(viewer, FallRoster(byUser = byUser)))
    }

    private fun receive(event: FallEvent) {
        if (event.userId == sources.viewerId()) return
        reduce { it.apply(event) }
        noticeOf(event)?.let(_notices::tryEmit)
    }

    private fun noticeOf(event: FallEvent): FallNotice? = when (event) {
        is FallEvent.Detected -> event.announcedAtMillis?.let { FallNotice(event.userId, FallNotice.Kind.DETECTED, it) }
        is FallEvent.Cleared ->
            if (event.reason == FallClearedReason.RESPONDED) FallNotice(event.userId, FallNotice.Kind.RESPONDED, sources.now()) else null
    }

    private fun reduce(transition: (FallRoster) -> FallRoster) {
        synchronized(_roster) { _roster.value = transition(_roster.value) }
    }

    private companion object {
        const val NOTICE_BUFFER = 16
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface FallStoreModule {
    @Binds
    fun bindStore(repository: FallRepository): FallStore

    @Binds
    @IntoSet
    fun bindAccountCache(repository: FallRepository): PerAccountCache
}
