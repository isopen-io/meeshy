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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
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

    /** Reprend la liste gardée du compte connecté, et solde une échéance passée pendant que l'app dormait. */
    fun restore()

    /** Montrer ma position à une personne, à cette précision et pour cette durée. `null` : c'est parti. */
    suspend fun share(userId: String, precision: SharedLocationPrecision, duration: SharedLocationShareDuration): SharedLocationShareProblem?

    /** Ne plus montrer ma position à cette personne ; les autres gardent la leur. */
    suspend fun stopSharing(userId: String): SharedLocationShareProblem?

    fun nowMillis(): Long
}

/**
 * MON PARTAGE DE POSITION EN COURS (#16985), iso `SharedLocationSharingCenter.swift` (#16983) : la liste des personnes,
 * l'émission, le suivi de l'appareil et les échéances, pour le compte connecté. Le serveur garde la position complète,
 * scellée, et la tronque pour chaque personne ; ce centre ne floute rien et ne décide d'aucun droit — la passerelle
 * rejuge la loi à chaque envoi.
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
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ) : this(emitter, fixes, permission, store, { sessionRepository.currentUserId }, System::currentTimeMillis, dispatcher)

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val busy = Mutex()
    private val _roster = MutableStateFlow(SharedLocationRoster.EMPTY)
    private val _isBusy = MutableStateFlow(false)
    override val roster: StateFlow<SharedLocationRoster> = _roster.asStateFlow()
    override val isBusy: StateFlow<Boolean> = _isBusy.asStateFlow()

    private var loadedFor: String? = null
    private var lastSent: SharedLocationUpdateGate.Sent? = null
    private var following: Job? = null
    private var deadline: Job? = null

    override fun nowMillis(): Long = clock()

    override fun restore() {
        val account = accountId()?.takeIf { it.isNotEmpty() } ?: return
        if (account == loadedFor) return
        abandon()
        loadedFor = account
        _roster.value = SharedLocationRoster.fromStored(store.load(account))
        if (_roster.value.isEmpty) return
        startFollowing()
        scheduleDeadline()
        scope.launch { reconcile() }
    }

    override suspend fun share(
        userId: String,
        precision: SharedLocationPrecision,
        duration: SharedLocationShareDuration,
    ): SharedLocationShareProblem? = exclusively {
        if (!permission.isGranted()) return@exclusively SharedLocationShareProblem.LocationDenied
        val fix = deviceFix() ?: return@exclusively SharedLocationShareProblem.LocationUnavailable
        publish(_roster.value.pruned(clock()).adding(userId, precision, duration, clock()), fix)
    }

    override suspend fun stopSharing(userId: String): SharedLocationShareProblem? = exclusively {
        republish(_roster.value.pruned(clock()).removing(userId))
    }

    /** Une échéance est passée : la retirer du partage serveur. */
    suspend fun reconcile() {
        val pruned = _roster.value.pruned(clock())
        if (pruned == _roster.value) return
        exclusively { republish(pruned) }
    }

    /** Un relevé de l'appareil pendant le partage. */
    internal suspend fun didMove(fix: SharedLocationFix) {
        if (_roster.value.isEmpty || !SharedLocationUpdateGate.shouldSend(fix, clock(), lastSent)) return
        lastSent = SharedLocationUpdateGate.Sent(fix, clock())
        val verdict = emitter.update(fix)
        if (verdict == SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.NOT_SHARING)) wipe()
    }

    /**
     * Le compte change ou se déconnecte : cet appareil cesse de suivre la position pour lui sans rien émettre (la socket
     * appartient déjà au suivant), le terme serveur coupera son partage, et la liste gardée attend son retour pour qu'il
     * puisse encore l'arrêter.
     */
    override suspend fun clear() = abandon()

    private suspend fun exclusively(block: suspend () -> SharedLocationShareProblem?): SharedLocationShareProblem? {
        if (!busy.tryLock()) return null
        _isBusy.value = true
        return try {
            block()
        } finally {
            _isBusy.value = false
            busy.unlock()
        }
    }

    /** Redémarrer le partage serveur avec une liste réduite demande une position : la dernière envoyée, sinon l'appareil. */
    private suspend fun republish(next: SharedLocationRoster): SharedLocationShareProblem? {
        if (next.isEmpty) return publish(next, fix = null)
        val fix = lastSent?.fix ?: deviceFix() ?: return SharedLocationShareProblem.LocationUnavailable
        return publish(next, fix)
    }

    private suspend fun publish(next: SharedLocationRoster, fix: SharedLocationFix?): SharedLocationShareProblem? {
        if (next.isEmpty) {
            if (!emitter.stop()) return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.OFFLINE)
            wipe()
            return null
        }
        val request = fix?.let { SharedLocationStartRequest.of(next.recipients, next.serverDuration(clock()), it) }
            ?: return SharedLocationShareProblem.LocationUnavailable
        val verdict = emitter.start(request)
        if (verdict is SharedLocationStartVerdict.Refused) return SharedLocationShareProblem.Refused(verdict.outcome)
        adopt(next)
        lastSent = SharedLocationUpdateGate.Sent(request.fix, clock())
        startFollowing()
        scheduleDeadline()
        return null
    }

    private suspend fun deviceFix(): SharedLocationFix? =
        if (permission.isGranted()) fixes.currentFix()?.let { SharedLocationFix.of(it.latitude, it.longitude, it.accuracy) } else null

    private fun adopt(next: SharedLocationRoster) {
        _roster.value = next
        loadedFor = loadedFor ?: accountId()
        loadedFor?.let { store.save(it, if (next.isEmpty) null else next.stored()) }
    }

    private fun startFollowing() {
        if (following?.isActive == true) return
        following = scope.launch {
            fixes.updates(SharedLocationUpdateGate.MINIMUM_INTERVAL_MS)
                .mapNotNull { SharedLocationFix.of(it.latitude, it.longitude, it.accuracy) }
                .catch { }
                .collect { didMove(it) }
        }
    }

    private fun scheduleDeadline() {
        deadline?.cancel()
        val at = _roster.value.nextDeadlineMillis ?: return
        deadline = scope.launch {
            delay((at - clock()).coerceAtLeast(0L) + DEADLINE_SLACK_MS)
            reconcile()
        }
    }

    private fun wipe() {
        adopt(SharedLocationRoster.EMPTY)
        lastSent = null
        stopTimers()
    }

    private fun abandon() {
        stopTimers()
        lastSent = null
        loadedFor = null
        _roster.value = SharedLocationRoster.EMPTY
    }

    private fun stopTimers() {
        deadline?.cancel()
        deadline = null
        following?.cancel()
        following = null
    }

    private companion object {
        /** Une seconde après l'échéance, pour que la personne soit bien sortie de la liste élaguée. */
        const val DEADLINE_SLACK_MS = 1_000L
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
