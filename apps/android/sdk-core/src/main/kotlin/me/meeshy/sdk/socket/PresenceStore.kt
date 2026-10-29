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
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
import me.meeshy.sdk.model.presence.PresenceRetention
import me.meeshy.sdk.model.presence.ServedPresencePage
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.session.PerAccountCache
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
    private val persistence: PresenceMapPersistence = PresenceMapPersistence.None,
    private val persistIntervalMillis: Long = PERSIST_INTERVAL_MS,
) : ServedPresenceSink, PerAccountCache {
    @Inject
    constructor(
        messageSocketManager: MessageSocketManager,
        socketManager: SocketManager,
        sessionRepository: SessionRepository,
        tokenStore: TokenStore,
        clock: CacheClock,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
        persistence: PresenceMapPersistence,
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
        persistence = persistence,
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
        scope.launch {
            sources.userStatus.collect { event ->
                applyLive(listOf(event.userId)) { map, _ -> PresenceMapReducer.applyStatus(map, event) }
            }
        }
        scope.launch {
            sources.presenceSnapshot.collect { snapshot ->
                applyLive(snapshot.users.map { it.userId }) { map, _ -> PresenceMapReducer.applySnapshot(map, snapshot.users) }
            }
        }
        scope.launch { sources.typingStarted.collect { event -> noteActivity(event.userId) } }
        scope.launch { sources.connectionState.collect(::onConnectionState) }
        scope.launch { sources.sessionUserId.collect { onSessionUser(it) } }
        val first = synchronized(lock) { adoptedLocked() }
        first.owner?.let { account -> scope.launch { restore(first.id, account) } }
        scope.launch { _entries.collect { persistNow(); delay(persistIntervalMillis) } }
    }

    /**
     * Semis depuis la charge que la page de conversations a servie (miroir de `PresenceManager.seed`
     * iOS) : seuls les INCONNUS sont semés, une entrée déjà posée — socket, frappe, relecture — est
     * gardée, et le compte courant n'y entre jamais.
     */
    override fun seed(served: Map<String, UserPresence>) = seed(ServedPresencePage(served))

    /**
     * Semis d'une page entière : comme ci-dessus, et une entrée qui ne venait que du DISQUE cède à la
     * page — remplacée par ce qu'elle sert, retirée si elle la masque. Le socket l'emporte toujours.
     */
    override fun seed(page: ServedPresencePage) {
        if (page.served.isEmpty() && page.masked.isEmpty()) return
        mutate { map, current ->
            val seeded = PresenceMapReducer.seed(map, current.restored, page, current.owner)
            seeded.entries to current.copy(restored = seeded.restored)
        }
    }

    /**
     * La carte appartient à UNE génération de compte : l'identifiant du compte qui la possède et un
     * numéro qui change à chaque passage de propriétaire (vers ou depuis aucun compte compris).
     * [readBack] : la relecture du disque de cette génération est faite ; [restored] : les comptes dont
     * l'entrée ne vient encore que de cette relecture (une page servie les remplace).
     */
    private data class Generation(
        val id: Long = 0,
        val owner: String? = null,
        val readBack: Boolean = false,
        val restored: Set<String> = emptySet(),
    ) {
        val adopted: Boolean get() = id > 0
    }

    /** Garde la génération et la carte ensemble : un événement, un semis, une relecture ou un vidage à la fois. */
    private val lock = Any()
    private var generation = Generation()

    /** Un seul à la fois écrit, relit ou efface le disque : un effacement n'est jamais rattrapé par une écriture tardive. */
    private val disk = Mutex()

    /** Ce qui est sur le disque : une écriture identique est sautée. */
    private var onDisk: PresenceMap = emptyMap()

    /** La génération courante ; la première est adoptée pour le compte connu au premier usage. */
    private fun adoptedLocked(): Generation {
        if (!generation.adopted) generation = Generation(id = 1, owner = currentUserId())
        return generation
    }

    /** Passe la carte à [account] : nouvelle génération, carte VIDE. `null` si le propriétaire ne change pas. */
    private fun handOverLocked(account: String?): Generation? {
        val current = adoptedLocked()
        if (current.owner == account) return null
        generation = Generation(id = current.id + 1, owner = account)
        _entries.value = emptyMap()
        return generation
    }

    /**
     * Applique [transform] à la carte de la génération courante, et seulement si elle a un
     * propriétaire qui est encore le compte connu : un événement reçu sans compte, ou pour un compte
     * qui n'est plus celui de la carte (socket de A encore ouvert après sa déconnexion), est jeté.
     */
    private inline fun mutate(transform: (PresenceMap, Generation) -> Pair<PresenceMap, Generation>) {
        synchronized(lock) {
            val current = adoptedLocked()
            val owner = current.owner ?: return
            if (owner != currentUserId()) return
            val before = _entries.value
            val (next, nextGeneration) = transform(before, current)
            generation = nextGeneration
            val mine = if (next.containsKey(owner)) next - owner else next
            if (mine != before) _entries.value = mine
        }
    }

    /** Une source vivante (socket, frappe, `viewing:*`) : les comptes [touched] ne sont plus « relus du disque ». */
    private inline fun applyLive(touched: Collection<String>, crossinline transform: (PresenceMap, String) -> PresenceMap) =
        mutate { map, current ->
            transform(map, current.owner.orEmpty()) to current.copy(restored = current.restored - touched.toSet())
        }

    /**
     * Relit le disque pour [account] dans la génération [id] et comble les inconnus de la carte (une
     * entrée vivante gagne toujours). Le résultat n'est versé que sous le verrou de la carte et si la
     * génération n'a pas changé pendant la lecture : un vidage survenu entre-temps n'est jamais rattrapé.
     */
    private suspend fun restore(id: Long, account: String) {
        disk.withLock {
            if (synchronized(lock) { generation.id } != id) return@withLock
            val now = clock.nowMillis()
            val persisted = persistence.load(account)
            val merged = synchronized(lock) {
                if (generation.id != id || currentUserId() != account) return@synchronized false
                val readBack = PresenceRetention.restoredAtLaunch(persisted, account, now)
                val before = _entries.value
                val added = readBack.keys - before.keys
                generation = generation.copy(readBack = true, restored = generation.restored + added)
                _entries.value = PresenceMapReducer.restore(before, readBack)
                true
            }
            if (merged) onDisk = PresenceRetention.retained(persisted, account, now)
        }
        persistNow()
    }

    /** Écrit la carte, bornée à 24 h et sans le compte courant, sous la clé du compte qui la possède — une fois son disque relu. */
    private suspend fun persistNow() = disk.withLock {
        val (owner, entries) = synchronized(lock) {
            val owner = generation.owner?.takeIf { generation.readBack && it == currentUserId() } ?: return@withLock
            owner to _entries.value
        }
        val retained = PresenceRetention.retained(entries, owner, clock.nowMillis())
        if (retained == onDisk) return@withLock
        persistence.save(owner, retained)
        onDisk = retained
    }

    private suspend fun clearDisk() = disk.withLock {
        onDisk = emptyMap()
        persistence.clear()
    }

    /**
     * Le vidage de [me.meeshy.sdk.session.SessionTeardown.wipe] : la carte quitte tout compte sur-le-champ
     * (plus rien ne s'y écrit jusqu'au compte suivant), puis le fichier est effacé — ATTENDU, une relecture
     * en cours achevée d'abord, et rien de ce qu'elle a lu n'est versé.
     */
    override suspend fun clear() {
        synchronized(lock) {
            generation = Generation(id = adoptedLocked().id + 1, owner = null)
            _entries.value = emptyMap()
        }
        clearDisk()
    }

    /**
     * La carte appartient au compte qui l'a reçue (miroir de `resetForLogout` iOS) : dès que le
     * compte connu change — déconnexion, bascule directe vers un autre, ou premier compte après une
     * session refusée —, elle est vidée et une nouvelle génération relit le disque du nouveau compte.
     * La coupure du socket ne suffit pas : `reconnectWithToken` enchaîne DISCONNECTED puis CONNECTING
     * sous le même verrou, et un collecteur d'état conflaté ne voit que le second.
     */
    private suspend fun onSessionUser(userId: String?) {
        val account = userId ?: currentUserId()
        val (previous, next) = synchronized(lock) {
            val previous = adoptedLocked().owner
            previous to (handOverLocked(account) ?: return)
        }
        if (previous != null) clearDisk()
        next.owner?.let { restore(next.id, it) }
    }

    private var previousConnection: SocketConnectionState = SocketConnectionState.DISCONNECTED

    private fun onConnectionState(state: SocketConnectionState) {
        val previous = previousConnection
        previousConnection = state
        when (state) {
            SocketConnectionState.CONNECTING ->
                if (previous == SocketConnectionState.CONNECTED) mutate { map, g -> PresenceMapReducer.socketDisconnected(map) to g }
            SocketConnectionState.DISCONNECTED -> mutate { map, g -> PresenceMapReducer.socketDisconnected(map) to g }
            SocketConnectionState.CONNECTED -> Unit
        }
    }

    /**
     * Date l'activité de [userId] à maintenant (miroir de `PresenceManager.noteActivity` iOS) : un
     * pair annoncé dans la conversation (`viewing:*`) est actif LÀ, MAINTENANT, donc vert 60 s puis
     * il décroît. `isOnline` reste ce que le serveur a dit ; le compte courant n'écrit jamais la carte.
     */
    fun noteActivity(userId: String) {
        applyLive(listOf(userId)) { map, owner -> PresenceMapReducer.noteActivity(map, userId, owner, clock.nowMillis()) }
    }

    private fun isMe(userId: String): Boolean = userId == currentUserId()

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

    private companion object {
        /** Au plus une écriture disque toutes les 1,5 s (comme iOS), la dernière carte gagnant. */
        const val PERSIST_INTERVAL_MS = 1_500L
    }
}
