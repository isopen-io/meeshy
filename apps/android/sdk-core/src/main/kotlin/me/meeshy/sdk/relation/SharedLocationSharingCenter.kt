package me.meeshy.sdk.relation

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.location.LiveLocationFixSource
import me.meeshy.sdk.location.LocationPermissionGate
import me.meeshy.sdk.model.relation.SharedLocationFix
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationRoster
import me.meeshy.sdk.model.relation.SharedLocationSendOutcome
import me.meeshy.sdk.model.relation.SharedLocationShareDuration
import me.meeshy.sdk.model.relation.SharedLocationStartRequest
import me.meeshy.sdk.model.relation.SharedLocationStartVerdict
import me.meeshy.sdk.model.relation.SharedLocationUpdateGate
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager

/** Pourquoi un partage n'a pas démarré ou ne s'est pas arrêté. */
sealed interface SharedLocationShareProblem {
    data object LocationDenied : SharedLocationShareProblem

    data object LocationUnavailable : SharedLocationShareProblem

    data class Refused(val outcome: SharedLocationSendOutcome) : SharedLocationShareProblem
}

/** Où la liste survit à un lancement, par compte : des identifiants et des échéances, jamais une position. */
interface SharedLocationRosterStoring {
    fun load(accountId: String): String?

    /** `null` efface la liste gardée de ce compte. */
    fun save(accountId: String, stored: String?)
}

/** Ce que l'écran lit et pilote de MON partage de position. */
interface SharedLocationSharing {
    val roster: StateFlow<SharedLocationRoster>
    val isBusy: StateFlow<Boolean>

    /** Reprend la liste gardée du compte connecté, et solde une échéance passée pendant que l'app dormait (aussi à chaque socket accrochée). */
    fun restore()

    /** Montrer ma position à une personne, à cette précision et pour cette durée. `null` : c'est parti. */
    suspend fun share(userId: String, precision: SharedLocationPrecision, duration: SharedLocationShareDuration): SharedLocationShareProblem?

    /** Ne plus montrer ma position à cette personne ; les autres gardent la leur. */
    suspend fun stopSharing(userId: String): SharedLocationShareProblem?
}

/**
 * MON PARTAGE DE POSITION EN COURS (#16985), iso `SharedLocationSharingCenter.swift` (#16983) : la liste des personnes,
 * l'émission, le suivi de l'appareil et les échéances, pour le compte connecté. Le serveur garde la position complète,
 * scellée, et la tronque pour chaque personne ; ce centre ne floute rien et ne décide d'aucun droit — la passerelle
 * rejuge la loi à chaque envoi.
 *
 * Trois lois de révocation, que l'audit adversarial du lot a fait écrire :
 * - UN verrou sérialise démarrages, arrêts, échéances et mises à jour : une mise à jour en vol ne peut pas effacer un
 *   partage que le démarrage suivant vient de poser ;
 * - chaque opération porte le TICKET du compte qui l'a lancée : une réponse arrivée après une déconnexion ou un
 *   changement de compte n'adopte rien, n'écrit rien et ne rallume rien ;
 * - dans le doute, on ARRÊTE : sans relevé pour republier une liste réduite, tout le partage s'arrête ; un accusé perdu
 *   garde « Arrêter » à portée pour chaque personne que le serveur peut servir ; une échéance qui n'a pas pu se solder
 *   est rejouée, et à chaque socket accrochée.
 *
 * Le suivi ne vit que tant que l'app est utilisée : la permission demandée est celle « pendant l'utilisation » (fine ou
 * approximative, jamais `ACCESS_BACKGROUND_LOCATION`), et aucun service de premier plan ne la prolonge — l'émission en
 * arrière-plan attend l'avis de conformité (#13942, suite #18135). Le terme serveur coupe tout si l'appareil se tait.
 */
@Singleton
class SharedLocationSharingCenter internal constructor(
    private val emitter: SharedLocationEmitting,
    private val fixes: LiveLocationFixSource,
    private val permission: LocationPermissionGate,
    private val store: SharedLocationRosterStoring,
    private val accountId: () -> String?,
    connected: Flow<Boolean>,
    private val clock: () -> Long,
    dispatcher: CoroutineDispatcher,
) : SharedLocationSharing, PerAccountCache {

    @Inject
    constructor(
        emitter: SharedLocationEmitting,
        fixes: LiveLocationFixSource,
        permission: LocationPermissionGate,
        store: SharedLocationRosterStoring,
        sessionRepository: SessionRepository,
        socketManager: SocketManager,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ) : this(
        emitter,
        fixes,
        permission,
        store,
        { sessionRepository.currentUserId },
        socketManager.connectionState.map { it == SocketConnectionState.CONNECTED },
        System::currentTimeMillis,
        dispatcher,
    )

    /** Le compte d'une opération, et la génération de session à laquelle elle appartient. */
    private data class Ticket(val account: String, val generation: Int)

    private val root = SupervisorJob()
    private val scope = CoroutineScope(root + dispatcher)
    private val lock = Mutex()
    private val _roster = MutableStateFlow(SharedLocationRoster.EMPTY)
    private val _isBusy = MutableStateFlow(false)
    override val roster: StateFlow<SharedLocationRoster> = _roster.asStateFlow()
    override val isBusy: StateFlow<Boolean> = _isBusy.asStateFlow()

    @Volatile private var generation = 0
    @Volatile private var session: Job = SupervisorJob(root)
    @Volatile private var loadedFor: String? = null
    @Volatile private var lastSent: SharedLocationUpdateGate.Sent? = null
    @Volatile private var following: Job? = null
    @Volatile private var deadline: Job? = null

    init {
        scope.launch { connected.distinctUntilChanged().filter { it }.collect { reconcile() } }
    }

    override fun restore() {
        val settled = loadedFor != null && loadedFor == accountId() && _roster.value.pruned(clock()) == _roster.value
        if (settled) return
        scope.launch { reconcile() }
    }

    override suspend fun share(
        userId: String,
        precision: SharedLocationPrecision,
        duration: SharedLocationShareDuration,
    ): SharedLocationShareProblem? = locked { ticket ->
        if (!permission.isGranted()) return@locked SharedLocationShareProblem.LocationDenied
        val fix = deviceFix() ?: return@locked SharedLocationShareProblem.LocationUnavailable
        val previous = _roster.value
        publish(ticket, previous.pruned(clock()).adding(userId, precision, duration, clock()), fix, previous)
    }

    override suspend fun stopSharing(userId: String): SharedLocationShareProblem? = locked { ticket ->
        republish(ticket, _roster.value.pruned(clock()).removing(userId))
    }

    /** Reprend la liste du compte connecté et retire du partage serveur chaque personne dont l'échéance est passée. */
    suspend fun reconcile() {
        locked { ticket ->
            val current = _roster.value
            val pruned = current.pruned(clock())
            if (pruned == current) return@locked null
            republish(ticket, pruned).also { if (it != null && isCurrent(ticket)) scheduleRetry() }
        }
    }

    /** Un relevé de l'appareil pendant le partage ; sauté si une publication tient le verrou, le suivant passera. */
    internal suspend fun didMove(fix: SharedLocationFix) {
        if (!lock.tryLock()) return
        try {
            val ticket = currentTicket()?.takeIf(::isCurrent) ?: return
            if (_roster.value.isEmpty || !SharedLocationUpdateGate.shouldSend(fix, clock(), lastSent)) return
            lastSent = SharedLocationUpdateGate.Sent(fix, clock())
            val verdict = emitter.update(fix)
            if (isCurrent(ticket) && verdict == SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.NOT_SHARING)) {
                wipe(ticket)
            }
        } finally {
            lock.unlock()
        }
    }

    /**
     * Le compte change ou se déconnecte : cet appareil cesse de suivre la position pour lui sans rien émettre (la socket
     * appartient déjà au suivant), toute réponse encore en vol est écartée, le terme serveur coupera son partage, et la
     * liste gardée attend son retour pour qu'il puisse encore l'arrêter.
     */
    override suspend fun clear() = resetSession(account = null)

    private suspend fun locked(block: suspend (Ticket) -> SharedLocationShareProblem?): SharedLocationShareProblem? =
        lock.withLock {
            _isBusy.value = true
            try {
                val ticket = ensureLoaded() ?: return@withLock SharedLocationShareProblem.LocationUnavailable
                block(ticket)
            } finally {
                _isBusy.value = false
            }
        }

    /** Sous le verrou : la liste gardée du compte connecté, chargée une fois par session. */
    private fun ensureLoaded(): Ticket? {
        val account = accountId()?.takeIf { it.isNotEmpty() } ?: return null
        if (account != loadedFor) {
            resetSession(account)
            _roster.value = SharedLocationRoster.fromStored(store.load(account))
            if (!_roster.value.isEmpty) {
                startFollowing()
                scheduleDeadline()
            }
        }
        return Ticket(account, generation)
    }

    private fun resetSession(account: String?) {
        generation += 1
        session.cancel()
        session = SupervisorJob(root)
        following = null
        deadline = null
        lastSent = null
        loadedFor = account
        _roster.value = SharedLocationRoster.EMPTY
    }

    private fun currentTicket(): Ticket? = loadedFor?.let { Ticket(it, generation) }

    private fun isCurrent(ticket: Ticket): Boolean = ticket.generation == generation && accountId() == ticket.account

    /**
     * Redémarrer le partage serveur avec une liste réduite demande une position : la dernière envoyée, sinon l'appareil.
     * Sans l'une ni l'autre (permission retirée, aucun relevé), TOUT s'arrête : retirer une personne ne dépend jamais
     * de la localisation.
     */
    private suspend fun republish(ticket: Ticket, next: SharedLocationRoster): SharedLocationShareProblem? {
        if (next.isEmpty) return stopAll(ticket)
        val fix = lastSent?.fix ?: deviceFix() ?: return stopAll(ticket)
        return publish(ticket, next, fix, previous = _roster.value)
    }

    private suspend fun publish(
        ticket: Ticket,
        next: SharedLocationRoster,
        fix: SharedLocationFix,
        previous: SharedLocationRoster,
    ): SharedLocationShareProblem? {
        val request = SharedLocationStartRequest.of(next.recipients, next.serverDuration(clock()), fix)
            ?: return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.INVALID)
        if (!isCurrent(ticket)) return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.FAILED)
        val verdict = emitter.start(request)
        if (!isCurrent(ticket)) return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.FAILED)
        return when (verdict) {
            is SharedLocationStartVerdict.Started -> {
                engage(ticket, next, fix)
                null
            }
            SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.UNCONFIRMED) -> {
                engage(ticket, previous.union(next), fix)
                SharedLocationShareProblem.Refused(SharedLocationSendOutcome.UNCONFIRMED)
            }
            is SharedLocationStartVerdict.Refused -> SharedLocationShareProblem.Refused(verdict.outcome)
        }
    }

    private suspend fun stopAll(ticket: Ticket): SharedLocationShareProblem? {
        if (!isCurrent(ticket)) return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.FAILED)
        val stopped = emitter.stop()
        if (!isCurrent(ticket)) return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.FAILED)
        if (!stopped) return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.OFFLINE)
        wipe(ticket)
        return null
    }

    private suspend fun deviceFix(): SharedLocationFix? =
        if (permission.isGranted()) fixes.currentFix()?.let { SharedLocationFix.of(it.latitude, it.longitude, it.accuracy) } else null

    private fun engage(ticket: Ticket, next: SharedLocationRoster, fix: SharedLocationFix) {
        adopt(ticket, next)
        lastSent = SharedLocationUpdateGate.Sent(fix, clock())
        startFollowing()
        scheduleDeadline()
    }

    private fun adopt(ticket: Ticket, next: SharedLocationRoster) {
        _roster.value = next
        store.save(ticket.account, if (next.isEmpty) null else next.stored())
    }

    private fun startFollowing() {
        if (following?.isActive == true) return
        following = CoroutineScope(session + scope.coroutineContext.minusKey(Job)).launch {
            fixes.updates(SharedLocationUpdateGate.MINIMUM_INTERVAL_MS)
                .mapNotNull { SharedLocationFix.of(it.latitude, it.longitude, it.accuracy) }
                .catch { }
                .collect { didMove(it) }
        }
    }

    private fun scheduleDeadline() {
        val at = _roster.value.nextDeadlineMillis ?: return cancelDeadline()
        armDeadline((at - clock()).coerceAtLeast(0L) + DEADLINE_SLACK_MS)
    }

    private fun scheduleRetry() = armDeadline(RETRY_MS)

    /** Le minuteur ne fait que réveiller : la réconciliation tourne à part, pour qu'un nouveau minuteur ne l'annule pas. */
    private fun armDeadline(delayMillis: Long) {
        cancelDeadline()
        val sessionScope = CoroutineScope(session + scope.coroutineContext.minusKey(Job))
        deadline = sessionScope.launch {
            delay(delayMillis)
            sessionScope.launch { reconcile() }
        }
    }

    private fun cancelDeadline() {
        deadline?.cancel()
        deadline = null
    }

    private fun wipe(ticket: Ticket) {
        adopt(ticket, SharedLocationRoster.EMPTY)
        lastSent = null
        following?.cancel()
        following = null
        cancelDeadline()
    }

    private companion object {
        /** Une seconde après l'échéance, pour que la personne soit bien sortie de la liste élaguée. */
        const val DEADLINE_SLACK_MS = 1_000L

        /** Une échéance qui n'a pas pu se solder (hors ligne, refus) est rejouée à ce rythme, et à chaque reconnexion. */
        const val RETRY_MS = 30_000L
    }
}

/** La liste d'UN compte, dans les préférences privées de l'app. */
class SharedPreferencesSharedLocationRosterStore @Inject constructor(
    @ApplicationContext context: Context,
) : SharedLocationRosterStoring {
    private val prefs = context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override fun load(accountId: String): String? = prefs.getString(KEY_PREFIX + accountId, null)

    override fun save(accountId: String, stored: String?) {
        val editor = prefs.edit()
        if (stored == null) editor.remove(KEY_PREFIX + accountId) else editor.putString(KEY_PREFIX + accountId, stored)
        editor.apply()
    }

    private companion object {
        const val FILE_NAME = "meeshy_shared_location_roster"
        const val KEY_PREFIX = "roster."
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SharedLocationSharingModule {
    @Binds
    fun bindEmitter(emitter: SharedLocationSocketEmitter): SharedLocationEmitting

    @Binds
    fun bindStore(store: SharedPreferencesSharedLocationRosterStore): SharedLocationRosterStoring

    @Binds
    fun bindSharing(center: SharedLocationSharingCenter): SharedLocationSharing

    @Binds
    @IntoSet
    fun bindAccountCache(center: SharedLocationSharingCenter): PerAccountCache
}
