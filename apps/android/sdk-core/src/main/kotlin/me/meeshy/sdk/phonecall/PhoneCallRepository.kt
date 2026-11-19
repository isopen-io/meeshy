package me.meeshy.sdk.phonecall

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
import me.meeshy.sdk.model.phonecall.PhoneCallAnnouncement
import me.meeshy.sdk.model.phonecall.PhoneCallEvent
import me.meeshy.sdk.model.phonecall.PhoneCallRoster
import me.meeshy.sdk.model.phonecall.PhoneCallRosterSnapshot
import me.meeshy.sdk.model.phonecall.PhoneCallState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PhoneCallApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.PhoneCallSocketEventsManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager

/** Une annonce à faire défiler dans la SyncPill : « Jacques est en appel » ou « Jacques a raccroché ». */
data class PhoneCallNotice(val userId: String, val announcement: PhoneCallAnnouncement)

/** Ce que l'interface lit des états « en appel » des personnes qui me les partagent. */
interface PhoneCallStore {
    /** Tous les états servis, par personne — un état expiré y reste jusqu'au prochain rattrapage, mais ne se lit plus. */
    val roster: StateFlow<PhoneCallRoster>

    /** Les annonces, dans l'ordre du fil ; jamais rejouées à un nouvel abonné. */
    val notices: SharedFlow<PhoneCallNotice>

    /** L'identité du compte connecté : mon propre état ne m'est jamais montré. */
    val viewerId: String?

    /** L'état BRUT d'une personne ; l'affichage le confronte à son expiration ([PhoneCallState.isLiveAt]). */
    fun stateOf(userId: String?): Flow<PhoneCallState?>
}

/** Où le dernier roster servi se range entre deux lancements ; une lecture ou une écriture qui échoue ne casse rien. */
interface PhoneCallRosterCache {
    fun read(): PhoneCallRosterSnapshot?

    /** `null` efface. */
    fun write(snapshot: PhoneCallRosterSnapshot?)
}

/** Un fichier JSON privé de l'application : un seul compte à la fois, vidé au changement de compte. */
class FilePhoneCallRosterCache(context: Context, private val json: Json) : PhoneCallRosterCache {
    private val file = File(context.applicationContext.filesDir, FILE_NAME)

    override fun read(): PhoneCallRosterSnapshot? = runCatching {
        if (!file.exists()) return null
        json.decodeFromString(PhoneCallRosterSnapshot.serializer(), file.readText())
    }.getOrNull()

    override fun write(snapshot: PhoneCallRosterSnapshot?) {
        runCatching {
            if (snapshot == null || snapshot.items.isEmpty()) {
                file.delete()
            } else {
                file.writeText(json.encodeToString(PhoneCallRosterSnapshot.serializer(), snapshot))
            }
        }
    }

    private companion object {
        const val FILE_NAME = "meeshy_phone_call_roster.json"
    }
}

/** Les flux qui nourrissent le magasin — isolés pour que les tests les pilotent à la main. */
internal class PhoneCallSources(
    val events: Flow<PhoneCallEvent>,
    val connected: Flow<Boolean>,
    val snapshot: suspend () -> List<PhoneCallState>?,
    val viewerId: () -> String?,
    val cache: PhoneCallRosterCache,
    val now: () -> Long,
)

/**
 * « EN APPEL », CÔTÉ SANG (#18753) — le branchement de [PhoneCallRoster], patron de `InactivityRepository` (#18738).
 *
 * `phone-call:started` (qui REMPLACE) / `phone-call:ended` s'appliquent dans l'ordre du fil ; à chaque socket accrochée,
 * le rattrapage (`GET /relations/phone-calls`) fait foi, sauf pour les personnes qu'un événement a touchées depuis.
 * CACHE-FIRST : le dernier roster servi est rangé par compte, se peint dès la construction, et un état expiré n'y est
 * pas relu. La déconnexion ou le changement de compte vident tout, cache compris ([clear]).
 */
@Singleton
class PhoneCallRepository internal constructor(
    private val sources: PhoneCallSources,
    dispatcher: CoroutineDispatcher,
) : PhoneCallStore, PerAccountCache {

    @Inject
    constructor(
        @ApplicationContext context: Context,
        api: PhoneCallApi,
        sockets: PhoneCallSocketEventsManager,
        socketManager: SocketManager,
        sessionRepository: SessionRepository,
        json: Json,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ) : this(
        PhoneCallSources(
            events = sockets.events,
            connected = socketManager.connectionState.map { it == SocketConnectionState.CONNECTED },
            snapshot = { (apiCall { api.snapshot() } as? NetworkResult.Success)?.data?.served(json) },
            viewerId = { sessionRepository.currentUserId },
            cache = FilePhoneCallRosterCache(context, json),
            now = System::currentTimeMillis,
        ),
        dispatcher,
    )

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val _roster = MutableStateFlow(restored())
    override val roster: StateFlow<PhoneCallRoster> = _roster.asStateFlow()
    private val _notices = MutableSharedFlow<PhoneCallNotice>(extraBufferCapacity = NOTICE_BUFFER)
    override val notices: SharedFlow<PhoneCallNotice> = _notices.asSharedFlow()

    override val viewerId: String? get() = sources.viewerId()

    init {
        scope.launch { sources.events.collect(::receive) }
        scope.launch { sources.connected.distinctUntilChanged().filter { it }.collect { launch { catchUp() } } }
        scope.launch { roster.map { it.byUser }.distinctUntilChanged().collect(::persist) }
    }

    override fun stateOf(userId: String?): Flow<PhoneCallState?> =
        roster.map { roster -> userId?.let(roster.byUser::get) }.distinctUntilChanged()

    internal suspend fun catchUp() {
        val viewer = sources.viewerId()
        val mark = _roster.value.mark
        val items = sources.snapshot() ?: return
        if (sources.viewerId() != viewer) return
        reduce { it.reconcile(items, mark) }
    }

    override suspend fun clear() {
        reduce { PhoneCallRoster() }
        sources.cache.write(null)
    }

    private fun restored(): PhoneCallRoster =
        sources.cache.read()?.restore(sources.viewerId(), sources.now()) ?: PhoneCallRoster()

    private fun persist(byUser: Map<String, PhoneCallState>) {
        val viewer = sources.viewerId() ?: return
        sources.cache.write(PhoneCallRosterSnapshot.of(viewer, PhoneCallRoster(byUser = byUser)))
    }

    /** Mon propre état ne m'est jamais montré : il n'entre ni dans le registre ni dans la pastille (comme le web et iOS). */
    private fun receive(event: PhoneCallEvent) {
        if (event.userId == sources.viewerId()) return
        reduce { it.apply(event) }
        val announcement = event.announcement ?: return
        _notices.tryEmit(PhoneCallNotice(event.userId, announcement))
    }

    private fun reduce(transition: (PhoneCallRoster) -> PhoneCallRoster) {
        synchronized(_roster) { _roster.value = transition(_roster.value) }
    }

    private companion object {
        const val NOTICE_BUFFER = 16
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PhoneCallStoreModule {
    @Binds
    fun bindStore(repository: PhoneCallRepository): PhoneCallStore

    @Binds
    @IntoSet
    fun bindAccountCache(repository: PhoneCallRepository): PerAccountCache
}
