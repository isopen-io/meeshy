package me.meeshy.sdk.socket

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.shareIn
import kotlinx.coroutines.flow.transformWhile
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.PresenceSnapshotEvent
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.model.presence.PresenceDecayClock
import me.meeshy.sdk.model.presence.PresenceMap
import me.meeshy.sdk.model.presence.PresenceMapReducer
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/** Les flux temps réel dont la carte se nourrit — isolés pour que les tests les pilotent à la main. */
internal class PresenceSources(
    val userStatus: Flow<UserStatusEvent>,
    val presenceSnapshot: Flow<PresenceSnapshotEvent>,
    val typingStarted: Flow<TypingEvent>,
    val connectionState: Flow<SocketConnectionState>,
    val sessionUserId: Flow<String?> = kotlinx.coroutines.flow.emptyFlow(),
)

/**
 * LA carte de présence de la session (miroir de `PresenceManager` iOS) : un singleton, abonné dès le
 * démarrage du process — pas par écran —, qui fusionne `user:status`, `presence:snapshot` et la
 * frappe, et garde ses entrées à la coupure du socket (elles décroissent, `isOnline` à faux). Les flux socket sont chauds SANS rejeu : une carte par
 * écran ratait le snapshot posté après l'authentification, un écran ouvert ensuite repartait vide.
 * Ici le snapshot est GARDÉ EN ÉTAT, donc tout écran ouvert après lui le voit.
 *
 * Visibilité : la carte ne contient que ce que le serveur a servi (la passerelle décide de l'audience
 * des amis acceptés) ; rien n'est fabriqué, une entrée absente se lit « aucun point ».
 *
 * La logique de réduction est PURE ([PresenceMapReducer]) ; ce type n'est que le branchement.
 * Un seul tick partagé ([decayTicks], actif tant qu'un abonné existe) fait recalculer la décroissance
 * 60 s / 3 min / 5 min : [presenceOf] n'émet que quand l'ÉTAT d'un utilisateur change, donc un tick
 * qui ne franchit aucune marche ne recompose aucun avatar.
 */
@Singleton
class PresenceStore internal constructor(
    private val sources: PresenceSources,
    private val clock: CacheClock,
    private val currentUserId: () -> String?,
    dispatcher: CoroutineDispatcher,
    private val tickMillis: Long = PresenceDecayClock.TICK_MS,
) {
    @Inject
    constructor(
        messageSocketManager: MessageSocketManager,
        socketManager: SocketManager,
        sessionRepository: SessionRepository,
        tokenStore: TokenStore,
        clock: CacheClock,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ) : this(
        PresenceSources(
            userStatus = messageSocketManager.userStatus,
            presenceSnapshot = messageSocketManager.presenceSnapshot,
            typingStarted = messageSocketManager.typingStarted,
            connectionState = socketManager.connectionState,
            sessionUserId = sessionRepository.currentUser.map { it?.id },
        ),
        clock,
        { (sessionRepository.currentUserId ?: tokenStore.userId)?.takeIf { it.isNotBlank() } },
        dispatcher,
    )

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val _entries = MutableStateFlow<PresenceMap>(emptyMap())
    private val ticking = MutableStateFlow(false)

    /** Vrai tant que la boucle de l'horloge partagée tourne (au moins un abonné non figé). */
    internal val isTicking: StateFlow<Boolean> = ticking.asStateFlow()
    private var started = false

    /** La carte unique `userId` -> présence servie. Vide tant que le serveur n'a rien servi. */
    val entries: StateFlow<PresenceMap> = _entries.asStateFlow()

    /**
     * L'horloge partagée de la décroissance : un tick toutes les [tickMillis], UNE seule boucle pour
     * tous les abonnés, arrêtée quand plus personne n'écoute.
     */
    val decayTicks: Flow<Unit> = flow {
        ticking.value = true
        try {
            while (true) {
                delay(tickMillis)
                emit(Unit)
            }
        } finally {
            ticking.value = false
        }
    }.shareIn(scope, SharingStarted.WhileSubscribed())

    /** Abonne la carte aux flux socket. Idempotent ; à appeler au démarrage du process. */
    @Synchronized
    fun start() {
        if (started) return
        started = true
        scope.launch { sources.userStatus.collect { event -> _entries.update { withoutMe(PresenceMapReducer.applyStatus(it, event)) } } }
        scope.launch { sources.presenceSnapshot.collect { snapshot -> _entries.update { withoutMe(PresenceMapReducer.applySnapshot(it, snapshot.users)) } } }
        scope.launch {
            sources.typingStarted.collect { event ->
                _entries.update { PresenceMapReducer.noteActivity(it, event.userId, currentUserId(), clock.nowMillis()) }
            }
        }
        scope.launch { sources.connectionState.collect(::onConnectionState) }
        scope.launch { sources.sessionUserId.collect(::onSessionUser) }
    }

    private var previousSessionUser: String? = null

    /**
     * La carte appartient au compte qui l'a reçue (miroir de `resetForLogout` iOS) : dès que le
     * compte connu change — déconnexion ou bascule directe vers un autre —, elle est vidée. La
     * coupure du socket ne suffit pas : `reconnectWithToken` enchaîne DISCONNECTED puis CONNECTING
     * sous le même verrou, et un collecteur d'état conflaté ne voit que le second.
     */
    private fun onSessionUser(userId: String?) {
        val previous = previousSessionUser
        previousSessionUser = userId
        if (previous != null && previous != userId) _entries.value = emptyMap()
    }

    private var previousConnection: SocketConnectionState = SocketConnectionState.DISCONNECTED

    private fun onConnectionState(state: SocketConnectionState) {
        val previous = previousConnection
        previousConnection = state
        when (state) {
            SocketConnectionState.CONNECTING ->
                if (previous == SocketConnectionState.CONNECTED) _entries.update(PresenceMapReducer::socketDisconnected)
            SocketConnectionState.DISCONNECTED -> _entries.update(PresenceMapReducer::socketDisconnected)
            SocketConnectionState.CONNECTED -> Unit
        }
    }

    private fun isMe(userId: String): Boolean = userId == currentUserId()

    /** Le compte courant n'a jamais de présence servie (miroir de `knownPresenceState` iOS). */
    private fun withoutMe(map: PresenceMap): PresenceMap {
        val me = currentUserId() ?: return map
        return if (map.containsKey(me)) map - me else map
    }

    /** L'entrée servie de [userId] ; `null` = rien servi (aucun point), toujours pour le compte courant. */
    fun entryOf(userId: String): Flow<UserPresence?> =
        _entries.map { if (isMe(userId)) null else it[userId] }.distinctUntilChanged()

    /**
     * L'état du point de [userId] à cet instant, sans abonnement (valeur initiale d'une surface) :
     * la carte d'abord, [served] sinon ; `null` = aucun point, toujours pour le compte courant.
     */
    fun currentStateOf(userId: String, served: UserPresence? = null): PresenceState? {
        if (isMe(userId)) return null
        return (_entries.value[userId] ?: served)?.state(clock.nowMillis())
    }

    /**
     * L'état du point de [userId], recalculé avec le temps ; `null` = aucune entrée, aucun point.
     * N'émet qu'au changement d'état (jamais à chaque tick).
     */
    fun presenceOf(userId: String): Flow<PresenceState?> = decayingState(entryOf(userId))

    /**
     * Comme [presenceOf], avec la présence que la charge a SERVIE ([served] : `isOnline` +
     * `lastActiveAt` de la ligne) en repli : la carte vivante d'abord, la charge sinon (miroir de
     * `PresenceManager.resolvedState` iOS). Sans carte ni charge : aucun point.
     */
    fun presenceOf(userId: String, served: UserPresence?): Flow<PresenceState?> =
        if (served == null) presenceOf(userId)
        else decayingState(_entries.map { if (isMe(userId)) null else it[userId] ?: served }.distinctUntilChanged())

    private fun decayingState(entry: Flow<UserPresence?>): Flow<PresenceState?> =
        entry.flatMapLatest { presence ->
            flow {
                val first = PresenceDecayClock.derive(presence, clock.nowMillis())
                emit(first)
                if (presence == null || PresenceDecayClock.isSettled(presence, first)) return@flow
                decayTicks.transformWhile {
                    val state = PresenceDecayClock.derive(presence, clock.nowMillis())
                    emit(state)
                    !PresenceDecayClock.isSettled(presence, state)
                }.collect { emit(it) }
            }
        }.distinctUntilChanged()

    /** L'instant de référence de la décroissance (l'horloge injectée, jamais celle du système en dur). */
    fun nowMillis(): Long = clock.nowMillis()
}
