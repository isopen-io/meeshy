package me.meeshy.sdk.socket

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
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

    /**
     * La carte tenue et, avec elle, les comptes dont l'entrée ne vient encore que de la relecture du disque
     * ([restored]) : une page servie les remplace, une source vivante les confirme. [heard] : la marque de
     * réception du dernier événement du socket pour chaque compte de la carte — une page qui le masque ne
     * l'épargne que si cette marque est postérieure à la sienne. Rien de ce qui est tenu ne se lit tel quel —
     * toute lecture passe par [visibleAt].
     */
    private data class Held(
        val entries: PresenceMap = emptyMap(),
        val restored: Set<String> = emptySet(),
        val heard: Map<String, Long> = emptyMap(),
    ) {
        /**
         * Ce que la carte montre à [nowMillis] (#13774) : une entrée relue dont le point s'est éteint, ou datée dans
         * le futur, ne se montre plus — à la lecture, quelle que soit l'avance du minuteur de ménage, qui ne compte
         * ni la veille profonde ni un recul de l'horloge murale. Une entrée vivante est toujours montrée.
         */
        fun visibleAt(nowMillis: Long): PresenceMap =
            if (restored.isEmpty()) entries else PresenceMapReducer.expireReadBack(entries, restored, nowMillis).entries
    }

    private val held = MutableStateFlow(Held())
    private val ticking = MutableStateFlow(false)

    /** Vrai tant que la boucle de l'horloge partagée tourne (au moins un abonné non figé). */
    internal val isTicking: StateFlow<Boolean> = ticking.asStateFlow()
    private var started = false

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

    /**
     * Ce que la carte montre, à chaque changement : la carte tenue, et — tant qu'une entrée n'est que relue — à chaque
     * tick de l'horloge partagée, pour qu'un écran déjà ouvert perde une entrée relue éteinte au premier tick suivant
     * le réveil, sans attendre le minuteur de ménage.
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    private val visible: Flow<PresenceMap> = held.flatMapLatest { current ->
        if (current.restored.isEmpty()) flowOf(current.entries)
        else decayTicks.onStart { emit(Unit) }.map { current.visibleAt(clock.nowMillis()) }
    }.distinctUntilChanged()

    /** La carte unique `userId` -> présence servie, à chaque changement. Vide tant que le serveur n'a rien servi. */
    val entries: Flow<PresenceMap> = visible

    /** La carte telle qu'elle se montre À CET INSTANT, sans abonnement — jamais une copie que l'horloge a pu dépasser. */
    fun entriesNow(): PresenceMap = held.value.visibleAt(clock.nowMillis())

    /**
     * La marque de réception, posée par l'appelant sur la page dont la réponse vient d'arriver : chaque
     * événement du socket reçu ensuite porte une marque strictement plus grande. Un ordinal du process, pas
     * une heure : ni la veille profonde, ni un recul de l'horloge murale, ni l'horloge du serveur ne le faussent.
     */
    override fun receipt(): Long = synchronized(lock) { receipts }

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
        scope.launch { held.collect { persistNow(); delay(persistIntervalMillis) } }
    }

    /**
     * Semis depuis la charge que la page de conversations a servie (miroir de `PresenceManager.seed`
     * iOS) : seuls les INCONNUS sont semés, une entrée déjà posée — socket, frappe, relecture — est
     * gardée, et le compte courant n'y entre jamais.
     */
    override fun seed(served: Map<String, UserPresence>) = seed(ServedPresencePage(served))

    /**
     * Semis d'une page entière : comme ci-dessus, et une entrée qui ne venait que du DISQUE cède à la
     * page, remplacée par ce qu'elle sert. Une ligne masquée retire l'entrée quelle que soit son origine
     * (#13783), sauf si le socket en a parlé après la réception de la page ([ServedPresencePage.receipt]).
     */
    override fun seed(page: ServedPresencePage) {
        if (page.served.isEmpty() && page.masked.isEmpty()) return
        mutate { map, current ->
            val received = page.receipt ?: receipts
            val newer = map.heard.filterValues { it > received }.keys
            val seeded = PresenceMapReducer.seed(map.entries, map.restored, page, current.owner, newer)
            val withheld = if (current.readBack) current.withheld else current.withheld - page.served.keys + page.masked
            Held(seeded.entries, seeded.restored, map.heard.filterKeys { it in seeded.entries }) to current.copy(withheld = withheld)
        }
    }

    /**
     * La carte appartient à UNE génération de compte : l'identifiant du compte qui la possède et un
     * numéro qui change à chaque passage de propriétaire (vers ou depuis aucun compte compris).
     * [readBack] : la relecture du disque de cette génération est faite ; [withheld] : ceux qu'une page a
     * masqués AVANT la relecture, qu'elle ne réinjecte pas. Ce qui n'est que relu vit avec la carte ([Held]).
     */
    private data class Generation(
        val id: Long = 0,
        val owner: String? = null,
        val readBack: Boolean = false,
        val withheld: Set<String> = emptySet(),
    ) {
        val adopted: Boolean get() = id > 0
    }

    /** Garde la génération et la carte ensemble : un événement, un semis, une relecture ou un vidage à la fois. */
    private val lock = Any()
    private var generation = Generation()

    /** La dernière marque de réception donnée, sous [lock] ; elle ne revient jamais en arrière, même au changement de compte. */
    private var receipts = 0L

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
        held.value = Held()
        return generation
    }

    /**
     * Applique [transform] à la carte de la génération courante, et seulement si elle a un
     * propriétaire qui est encore le compte connu : un événement reçu sans compte, ou pour un compte
     * qui n'est plus celui de la carte (socket de A encore ouvert après sa déconnexion), est jeté.
     */
    private inline fun mutate(transform: (Held, Generation) -> Pair<Held, Generation>) {
        synchronized(lock) {
            val current = adoptedLocked()
            val owner = current.owner ?: return
            if (owner != currentUserId()) return
            val before = held.value
            val (next, nextGeneration) = transform(before, current)
            generation = nextGeneration
            val mine = if (next.entries.containsKey(owner)) next.copy(entries = next.entries - owner) else next
            if (mine != before) held.value = mine
        }
    }

    /**
     * Une source vivante (socket, frappe, `viewing:*`) : les comptes [touched] ne sont plus « relus du disque »,
     * et ils sont entendus sous une marque de réception neuve.
     */
    private inline fun applyLive(touched: Collection<String>, crossinline transform: (PresenceMap, String) -> PresenceMap) =
        mutate { map, current ->
            receipts += 1
            val entries = transform(map.entries, current.owner.orEmpty())
            val heard = (map.heard + touched.associateWith { receipts }).filterKeys { it in entries }
            Held(entries, map.restored - touched.toSet(), heard) to current
        }

    /**
     * Relit le disque pour [account] dans la génération [id] et comble les inconnus de la carte (une
     * entrée vivante gagne toujours, un compte qu'une page a déjà masqué ne revient pas). Le résultat
     * n'est versé que sous le verrou de la carte et si la génération n'a pas changé pendant la lecture :
     * un vidage survenu entre-temps n'est jamais rattrapé. Ce qui est relu s'éteint avec son point. Le disque
     * est noté tel qu'il a été LU, pas tel qu'il a été filtré : un fichier dont la relecture a écarté quelque
     * chose (écrit sous l'ancienne borne de 24 h, ou éteint depuis) est réécrit tout de suite.
     */
    private suspend fun restore(id: Long, account: String) {
        disk.withLock {
            if (synchronized(lock) { generation.id } != id) return@withLock
            val now = clock.nowMillis()
            val persisted = persistence.load(account)
            val merged = synchronized(lock) {
                if (generation.id != id || currentUserId() != account) return@synchronized false
                val readBack = PresenceRetention.restoredAtLaunch(persisted, account, now)
                val before = held.value
                val after = PresenceMapReducer.restore(before.entries, readBack, generation.withheld)
                generation = generation.copy(readBack = true, withheld = emptySet())
                held.value = before.copy(entries = after, restored = before.restored + (after.keys - before.entries.keys))
                true
            }
            if (merged) onDisk = persisted
        }
        persistNow()
        scope.launch { expireReadBack(id) }
    }

    /**
     * Le MÉNAGE de ce qui n'a été que relu du disque dans la génération [id] : à l'extinction de son point,
     * l'entrée quitte la carte tenue (et le disque à l'écriture suivante). Ce minuteur ne décide de rien qui se
     * voie — il ne compte ni la veille profonde ni un recul de l'horloge murale ; la lecture ([Held.visibleAt])
     * cache déjà ce qui s'est éteint. S'arrête quand plus rien n'est relu ou que la génération change.
     */
    private suspend fun expireReadBack(id: Long) {
        while (true) {
            val due = synchronized(lock) {
                if (generation.id != id) return
                val current = held.value
                PresenceRetention.nextReadBackExpiry(current.entries, current.restored) ?: return
            }
            delay((due - clock.nowMillis()).coerceAtLeast(0))
            synchronized(lock) {
                if (generation.id != id) return
                val current = held.value
                val expired = PresenceMapReducer.expireReadBack(current.entries, current.restored, clock.nowMillis())
                held.value = current.copy(entries = expired.entries, restored = expired.restored)
            }
        }
    }

    /** Écrit la carte, bornée à la vie du point et sans le compte courant, sous la clé du compte qui la possède — une fois son disque relu. */
    private suspend fun persistNow() = disk.withLock {
        val (owner, entries) = synchronized(lock) {
            val owner = generation.owner?.takeIf { generation.readBack && it == currentUserId() } ?: return@withLock
            owner to held.value.entries
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
     * Le vidage de [me.meeshy.sdk.session.SessionTeardown.wipe] : la carte est vidée sur-le-champ et passe
     * à une nouvelle génération, celle du compte connu À CET INSTANT — aucun après une déconnexion, ou celui
     * qui s'est connecté pendant le vidage (sans quoi la carte resterait sans propriétaire, figée jusqu'au
     * redémarrage). Puis le fichier est effacé — ATTENDU, une relecture en cours achevée d'abord, et rien de
     * ce qu'elle a lu n'est versé — et le compte connu relit le sien.
     */
    override suspend fun clear() {
        val next = synchronized(lock) {
            generation = Generation(id = adoptedLocked().id + 1, owner = currentUserId())
            held.value = Held()
            generation
        }
        clearDisk()
        next.owner?.let { restore(next.id, it) }
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
                if (previous == SocketConnectionState.CONNECTED) socketDisconnected()
            SocketConnectionState.DISCONNECTED -> socketDisconnected()
            SocketConnectionState.CONNECTED -> Unit
        }
    }

    private fun socketDisconnected() = mutate { map, g -> map.copy(entries = PresenceMapReducer.socketDisconnected(map.entries)) to g }

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
        visible.map { if (isMe(userId)) null else it[userId] }.distinctUntilChanged()

    /**
     * L'état du point de [userId] à cet instant, sans abonnement (valeur initiale d'une surface) :
     * la carte d'abord, [served] sinon ; `null` = aucun point, toujours pour le compte courant.
     */
    fun currentStateOf(userId: String, served: UserPresence? = null): PresenceState? {
        if (isMe(userId)) return null
        val now = clock.nowMillis()
        return (held.value.visibleAt(now)[userId] ?: served)?.state(now)
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
        else decayingState(visible.map { if (isMe(userId)) null else it[userId] ?: served }.distinctUntilChanged())

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
