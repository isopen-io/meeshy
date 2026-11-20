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
import kotlinx.coroutines.CancellationException
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
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.location.LiveLocationFixSource
import me.meeshy.sdk.location.LocationPermissionGate
import me.meeshy.sdk.model.relation.SharedLocationFix
import me.meeshy.sdk.model.relation.SharedLocationOwnSnapshot
import me.meeshy.sdk.model.relation.SharedLocationOwnSnapshotWire
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationRoster
import me.meeshy.sdk.model.relation.SharedLocationSendOutcome
import me.meeshy.sdk.model.relation.SharedLocationShareDuration
import me.meeshy.sdk.model.relation.SharedLocationStartRequest
import me.meeshy.sdk.model.relation.SharedLocationStartVerdict
import me.meeshy.sdk.model.relation.SharedLocationUpdateGate
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.RelationsApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.RelationSocketEventsManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager

/** Pourquoi un partage n'a pas démarré ou ne s'est pas arrêté. */
sealed interface SharedLocationShareProblem {
    data object LocationDenied : SharedLocationShareProblem

    data object LocationUnavailable : SharedLocationShareProblem

    data class Refused(val outcome: SharedLocationSendOutcome) : SharedLocationShareProblem

    /** « Arrêter » n'a pas pu partir : l'intention est gardée, et le centre la fait partir dès le retour du réseau. */
    data object WithdrawalPending : SharedLocationShareProblem
}

/** Où la liste survit à un lancement, par compte : des identifiants et des échéances, jamais une position. */
interface SharedLocationRosterStoring {
    fun load(accountId: String): String?

    /** `null` efface la liste gardée de ce compte. */
    fun save(accountId: String, stored: String?)

    /**
     * La liste de ce compte vient-elle d'un autre de ses appareils (#18578) ? Survit au lancement : un appareil qui n'a
     * fait que RECEVOIR la liste ne se remet jamais à publier sa position en se relançant.
     */
    fun loadReceived(accountId: String): Boolean

    fun saveReceived(accountId: String, received: Boolean)

    /**
     * Le démarrage que CET appareil a fait accepter (#19681) : survit au lancement avec la marque « reçue », s'efface avec
     * elle (arrêt, cession). Sans lui, un appareil relancé après qu'un autre a repris le partage prendrait le démarrage
     * de l'autre pour le sien et republierait.
     */
    fun loadPublishedStart(accountId: String): String?

    fun savePublishedStart(accountId: String, startedAt: String?)
}

/** Ce que l'écran lit et pilote de MON partage de position. */
interface SharedLocationSharing {
    val roster: StateFlow<SharedLocationRoster>
    val isBusy: StateFlow<Boolean>

    /** Reprend la liste gardée du compte connecté, et solde une échéance passée pendant que l'app dormait (aussi à chaque socket accrochée). */
    fun restore()

    /** Montrer ma position à une personne, à cette précision et pour cette durée. `null` : c'est parti. */
    suspend fun share(userId: String, precision: SharedLocationPrecision, duration: SharedLocationShareDuration): SharedLocationShareProblem?

    /**
     * Ne plus montrer ma position à cette personne ; les autres gardent la leur. Si l'arrêt ne peut pas partir, la
     * personne sort quand même de la liste et son retrait part dès que le réseau revient : on ne retouche jamais.
     */
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
 * - dans le doute, on ARRÊTE : une liste réduite part SEULE (#19287), et sans relevé pour la republier devant une
 *   passerelle d'avant, tout le partage s'arrête ; un accusé perdu
 *   garde « Arrêter » à portée pour chaque personne que le serveur peut servir ; une échéance qui n'a pas pu se solder
 *   est rejouée, et à chaque socket accrochée ; un « Arrêter » qui n'a pas pu partir devient un retrait en attente,
 *   gardé et rejoué de la même façon (#18204).
 *
 * PLUSIEURS APPAREILS, UN PARTAGE (#18389, #18578, iso `SharedLocationSharingCenter.swift` et `shared-location-sharing.ts`) :
 * la passerelle n'en connaît qu'un par compte, et c'est lui qui fait foi. [sync] relit ce qu'elle sert (à chaque socket
 * accrochée, avant la réconciliation, et à chaque `location:share-own-changed`) et s'y recale, retraits en attente d'ici
 * gagnants : un retrait fait ailleurs s'applique ici, un ajout fait ailleurs n'est plus effacé par la liste périmée de
 * cet appareil. Une liste REÇUE d'un autre appareil ne fait jamais partir la position d'ici : ni suivi, ni reprise au
 * lancement, et une échéance s'y solde sans rien envoyer — la passerelle tient l'échéance de chacun (#18205). Seul un
 * geste d'ici (« Partager », « Arrêter ») envoie quelque chose ; « Partager », une fois accepté, fait de cet appareil
 * celui qui publie.
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
    ownChanged: Flow<Unit> = emptyFlow(),
    private val served: suspend () -> SharedLocationOwnSnapshot? = { null },
) : SharedLocationSharing, PerAccountCache {

    @Inject
    constructor(
        emitter: SharedLocationEmitting,
        fixes: LiveLocationFixSource,
        permission: LocationPermissionGate,
        store: SharedLocationRosterStoring,
        sessionRepository: SessionRepository,
        socketManager: SocketManager,
        relationSockets: RelationSocketEventsManager,
        api: RelationsApi,
        json: Json,
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
        ownChanged = relationSockets.sharedLocationOwnChanged,
        served = { ownSharedLocationAnswer(apiCall { api.ownSharedLocation() }, json) },
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

    /** La liste vient d'un autre appareil du compte : celui-ci ne publie pas sa position (#18578). */
    @Volatile private var received = false

    /** Le dernier démarrage avec position que CET appareil a fait accepter (#18580) ; `null` : inconnu, le servi est pris pour le sien. */
    @Volatile private var publishedStart: String? = null

    /**
     * Relancé avec une liste qu'il publiait, l'appareil suit sa position mais n'en envoie rien avant d'avoir relu ce que la
     * passerelle sert (#19767, iso `SharedLocationSharingCenter.swift`) : un autre appareil a pu reprendre le partage
     * pendant qu'il dormait. Seules une réponse et une passerelle d'avant (`null`) lèvent l'attente, comme un « Partager »
     * d'ici ; une panne (relecture qui lève) la GARDE et la relecture se rejoue au rythme de [RETRY_MS] (#19928).
     */
    @Volatile private var awaitsServedTruth = false

    init {
        scope.launch {
            connected.distinctUntilChanged().filter { it }.collect {
                sync()
                reconcile(readingFirst = false)
            }
        }
        scope.launch { ownChanged.collect { sync() } }
    }

    override fun restore() {
        val settled = loadedFor != null && loadedFor == accountId() && _roster.value.isSettled(clock())
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
        publish(ticket, previous.pruned(clock()).adding(userId, precision, duration, clock()), fix, previous, claimsPublishing = true)
    }

    override suspend fun stopSharing(userId: String): SharedLocationShareProblem? = locked { ticket ->
        val problem = withdrawingRepublish(ticket, _roster.value.pruned(clock()).removing(userId))
        if (problem == null || !isCurrent(ticket) || _roster.value.entry(userId) == null) return@locked problem
        adopt(ticket, _roster.value.withdrawing(userId, clock()))
        scheduleDeadline()
        if (!_roster.value.hasRecipients) stopFollowingDevice()
        SharedLocationShareProblem.WithdrawalPending
    }

    /**
     * Reprend la liste du compte connecté et fait partir chaque échéance passée et chaque retrait en attente. Relancé et
     * pas encore relu, l'appareil relit d'abord (`readingFirst`, faux quand l'appelant vient de relire) : une échéance
     * passée ne fait pas partir une liste gardée périmée avant la relecture (elle retirerait ce qu'un autre appareil a
     * ajouté) — la passerelle tient l'échéance de chacun (#18205) —, et une panne laisse tout en attente, rejoué au rythme
     * du rejeu (#19928). Un « Arrêter » en attente, lui, part malgré la panne, en liste seule : la volonté de
     * l'utilisateur prime, et aucune position n'accompagne la liste.
     */
    suspend fun reconcile(readingFirst: Boolean = true): SharedLocationShareProblem? =
        locked { ticket ->
            if (_roster.value.isSettled(clock())) return@locked null
            if (readingFirst && awaitsServedTruth) syncLocked(ticket)
            if (!isCurrent(ticket)) return@locked SharedLocationShareProblem.Refused(SharedLocationSendOutcome.FAILED)
            if (_roster.value.isSettled(clock())) return@locked null
            val pruned = _roster.value.pruned(clock())
            if (awaitsServedTruth && !pruned.hasPendingWithdrawals) {
                if (!pruned.hasRecipients) stopFollowingDevice()
                scheduleRetry()
                return@locked SharedLocationShareProblem.Refused(SharedLocationSendOutcome.UNCONFIRMED)
            }
            if (pruned.isEmpty && !_roster.value.hasRecipients) {
                adopt(ticket, SharedLocationRoster.EMPTY)
                markReceived(ticket, false)
                rememberStart(ticket, null)
                cancelDeadline()
                return@locked null
            }
            if (received && !pruned.hasPendingWithdrawals) {
                if (pruned.isEmpty) wipe(ticket) else adopt(ticket, pruned)
                scheduleDeadline()
                return@locked null
            }
            withdrawingRepublish(ticket, pruned).also { if (it != null && isCurrent(ticket)) scheduleRetry() }
        }

    /**
     * Se recale sur le partage que la passerelle sert : un autre appareil du compte a pu le changer (#18578). Une liste
     * qui nomme un AUTRE démarrage (`startedAt`) que l'accusé d'ici fait céder la publication d'ici : un seul appareil
     * publie, celui du dernier « Partager » (#18580), sans qu'aucune horloge soit comparée. Une passerelle d'avant
     * (#18389) ne change rien et lève l'attente ; une panne ne change rien et la garde (#19928).
     */
    suspend fun sync() {
        locked { ticket ->
            syncLocked(ticket)
            null
        }
    }

    private suspend fun syncLocked(ticket: Ticket) {
        val read = readServed()
        if (!isCurrent(ticket)) return
        if (read !is ServedRead.Answered) {
            if (awaitsServedTruth) scheduleRetry()
            return
        }
        if (awaitsServedTruth) {
            awaitsServedTruth = false
            scheduleDeadline()
        }
        val truth = read.truth ?: return
        val before = _roster.value
        val next = before.withServed(truth, clock())
        val yields = next.hasRecipients && !received && before.hasRecipients && yieldsTo(ticket, truth.startedAt)
        if (next == before) {
            if (yields) yieldPublishing(ticket)
            return
        }
        if (yields || (next.hasRecipients && !before.hasRecipients)) markReceived(ticket, true)
        adopt(ticket, next)
        if (yields) yieldPublishing(ticket)
        if (!next.hasRecipients) {
            stopFollowingDevice()
            markReceived(ticket, false)
            rememberStart(ticket, null)
        }
        scheduleDeadline()
    }

    /** Ce qu'une relecture a donné : une réponse (`null` : passerelle d'avant), ou une panne (#19928). */
    private sealed interface ServedRead {
        data class Answered(val truth: SharedLocationOwnSnapshot?) : ServedRead

        data object Failed : ServedRead
    }

    /**
     * Une relecture qui lève (quelle que soit l'exception) est une PANNE : elle ne change rien, garde l'attente d'un
     * appareil relancé et ne tue jamais le collecteur des reconnexions, qui rejoue les retraits en attente. La marque
     * « reçue » s'écrit AVANT la liste reçue : un processus tué entre les deux écritures se relance muet, jamais publiant.
     */
    private suspend fun readServed(): ServedRead = try {
        ServedRead.Answered(served())
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
        ServedRead.Failed
    }

    /**
     * Un relevé de l'appareil pendant le partage ; sauté si une publication tient le verrou, le suivant passera. Rien ne
     * part tant qu'un retrait attend : le serveur sert peut-être encore la personne retirée.
     */
    internal suspend fun didMove(fix: SharedLocationFix) {
        if (!lock.tryLock()) return
        try {
            val ticket = currentTicket()?.takeIf(::isCurrent) ?: return
            val roster = _roster.value
            if (received || awaitsServedTruth || !roster.hasRecipients || roster.hasPendingWithdrawals) return
            if (!SharedLocationUpdateGate.shouldSend(fix, clock(), lastSent)) return
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
            received = store.loadReceived(account)
            publishedStart = store.loadPublishedStart(account)
            if (_roster.value.hasRecipients && !received) {
                awaitsServedTruth = true
                startFollowing()
            }
            scheduleDeadline()
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
        received = false
        publishedStart = null
        awaitsServedTruth = false
        loadedFor = account
        _roster.value = SharedLocationRoster.EMPTY
    }

    private fun currentTicket(): Ticket? = loadedFor?.let { Ticket(it, generation) }

    private fun isCurrent(ticket: Ticket): Boolean = ticket.generation == generation && accountId() == ticket.account

    /**
     * Retirer quelqu'un ou solder une échéance republie la LISTE SEULE (#19287, iso `SharedLocationSharingCenter.swift` et
     * du web #19284) : la passerelle reprend le point qu'elle garde, et cet appareil n'envoie pas sa position — il peut
     * n'avoir fait que recevoir la liste d'un autre appareil (#18580). « Pas de partage » : la passerelle dit ce qui court
     * ([settleNotSharing]). Une passerelle d'avant refuse la liste seule (`INVALID`) : la liste repart avec une position,
     * la dernière envoyée, sinon l'appareil ; sans l'une ni l'autre (permission retirée, aucun relevé), TOUT s'arrête :
     * retirer une personne ne dépend jamais de la localisation. Relancé et pas encore relu (#19767), l'appareil ne
     * republie pas SA position : le retrait reste en attente et se rejoue après la relecture.
     */
    private suspend fun republish(ticket: Ticket, wanted: SharedLocationRoster): SharedLocationShareProblem? {
        val next = wanted.settled()
        if (!next.hasRecipients) return stopAll(ticket)
        when (val listOnly = publish(ticket, next, fix = null, previous = _roster.value)) {
            SharedLocationShareProblem.Refused(SharedLocationSendOutcome.INVALID) -> Unit
            SharedLocationShareProblem.Refused(SharedLocationSendOutcome.NOT_SHARING) -> return settleNotSharing(ticket)
            else -> return listOnly
        }
        if (!isCurrent(ticket)) return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.FAILED)
        freshLastFix()?.let { return publish(ticket, next, it, previous = _roster.value) }
        if (awaitsServedTruth) return stopAll(ticket)
        val fix = deviceFix() ?: return stopAll(ticket)
        return publish(ticket, next, fix, previous = _roster.value)
    }

    /**
     * « Pas de partage » à une liste seule couvre aussi une session remplacée par un autre appareil pendant l'envoi : la
     * passerelle dit ce qui court. Un partage servi ⇒ le retrait reste en attente et se rejoue (la liste seule ignore qui
     * n'est plus servi), comme une relecture qui ne conclut pas : vider sur la foi d'une panne laisserait la personne
     * servie. Seul un partage servi VIDE vide la liste, sans arrêt ni relevé.
     */
    private suspend fun settleNotSharing(ticket: Ticket): SharedLocationShareProblem? {
        val truth = (readServed() as? ServedRead.Answered)?.truth
        if (!isCurrent(ticket)) return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.FAILED)
        if (truth == null || truth.recipients.isNotEmpty()) {
            return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.UNCONFIRMED)
        }
        wipe(ticket)
        return null
    }

    /**
     * La dernière position envoyée, tant qu'elle a l'âge d'un battement : au-delà, la republier la ferait passer pour
     * fraîche (le serveur la date de sa réception), on redemande l'appareil.
     */
    private fun freshLastFix(): SharedLocationFix? =
        lastSent?.takeIf { clock() - it.atMillis <= SharedLocationUpdateGate.HEARTBEAT_MS }?.fix

    /**
     * Un retrait refusé pour une autre raison que le réseau (débit, liste invalide, partage indisponible) ne se rejoue
     * pas des heures en laissant la personne servie : on ARRÊTE tout, et `stop` n'est pas limité en débit (#18204).
     */
    private suspend fun withdrawingRepublish(ticket: Ticket, wanted: SharedLocationRoster): SharedLocationShareProblem? {
        val problem = republish(ticket, wanted)
        if (problem == null || !isCurrent(ticket)) return problem
        val outcome = (problem as? SharedLocationShareProblem.Refused)?.outcome
        if (outcome == SharedLocationSendOutcome.OFFLINE || outcome == SharedLocationSendOutcome.UNCONFIRMED) return problem
        return stopAll(ticket)
    }

    /**
     * La liste envoyée solde tous les retraits en attente : c'est elle que le serveur sert dès qu'il l'accepte.
     * `claimsPublishing` : le geste « Partager » d'ici fait de cet appareil celui qui publie — mais seulement une fois le
     * démarrage accepté (ou son accusé perdu) : un « Partager » refusé laisse muet un appareil qui n'a fait que RECEVOIR la
     * liste, même au prochain lancement. `fix` nul : la liste seule, sans repli (une passerelle qui la connaît connaît
     * aussi les échéances par personne).
     */
    private suspend fun publish(
        ticket: Ticket,
        wanted: SharedLocationRoster,
        fix: SharedLocationFix?,
        previous: SharedLocationRoster,
        claimsPublishing: Boolean = false,
    ): SharedLocationShareProblem? {
        val next = wanted.settled()
        val now = clock()
        val recipients = next.deadlinedRecipients(now)
        val duration = next.serverDuration(now)
        val built = if (fix == null) {
            SharedLocationStartRequest.listOnly(recipients, duration)
        } else {
            SharedLocationStartRequest.of(recipients, duration, fix)
        }
        val request = built ?: return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.INVALID)
        if (!isCurrent(ticket)) return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.FAILED)
        val verdict = startTolerant(ticket, request)
        if (!isCurrent(ticket)) return SharedLocationShareProblem.Refused(SharedLocationSendOutcome.FAILED)
        return when (verdict) {
            is SharedLocationStartVerdict.Started -> {
                if (claimsPublishing) claimPublishing(ticket)
                if (fix != null) rememberStart(ticket, verdict.startedAt)
                engage(ticket, next, fix)
                null
            }
            SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.UNCONFIRMED) -> {
                if (claimsPublishing) claimPublishing(ticket)
                if (fix != null) rememberStart(ticket, null)
                engage(ticket, previous.union(next), fix)
                SharedLocationShareProblem.Refused(SharedLocationSendOutcome.UNCONFIRMED)
            }
            is SharedLocationStartVerdict.Refused -> {
                // La passerelle a PU appliquer un démarrage avec position qu'elle refuse ensuite : dans le doute, inconnu.
                if (fix != null) rememberStart(ticket, null)
                SharedLocationShareProblem.Refused(verdict.outcome)
            }
        }
    }

    /**
     * Une passerelle d'avant #18205 refuse l'échéance par personne (`INVALID`) : la même liste repart sans, une fois, et
     * le centre retire chacun à son échéance, comme avant.
     */
    private suspend fun startTolerant(ticket: Ticket, request: SharedLocationStartRequest): SharedLocationStartVerdict {
        val verdict = emitter.start(request)
        val legacy = verdict == SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.INVALID) &&
            request.carriesDeadlines && !request.isListOnly
        if (!legacy || !isCurrent(ticket)) return verdict
        return emitter.start(request.withoutDeadlines())
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

    /** `fix` nul : une liste seule, qui n'a rien envoyé de nouveau — la dernière position envoyée reste celle d'avant. */
    private fun engage(ticket: Ticket, next: SharedLocationRoster, fix: SharedLocationFix?) {
        adopt(ticket, next)
        fix?.let { lastSent = SharedLocationUpdateGate.Sent(it, clock()) }
        if (next.hasRecipients && !received) startFollowing()
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

    /** L'échéance la plus proche réveille le centre ; un retrait en attente le réveille au rythme du rejeu, au plus tard. */
    private fun scheduleDeadline() {
        val roster = _roster.value
        val untilDeadline = roster.nextDeadlineMillis?.let { (it - clock()).coerceAtLeast(0L) + DEADLINE_SLACK_MS }
        val untilRetry = RETRY_MS.takeIf { roster.hasPendingWithdrawals }
        val delayMillis = listOfNotNull(untilDeadline, untilRetry).minOrNull() ?: return cancelDeadline()
        armDeadline(delayMillis)
    }

    private fun scheduleRetry() = armDeadline(RETRY_MS)

    /** Le minuteur ne fait que réveiller : la réconciliation tourne à part, pour qu'un nouveau minuteur ne l'annule pas. */
    private fun armDeadline(delayMillis: Long) {
        cancelDeadline()
        val sessionScope = CoroutineScope(session + scope.coroutineContext.minusKey(Job))
        deadline = sessionScope.launch {
            delay(delayMillis)
            sessionScope.launch {
                if (awaitsServedTruth) sync()
                reconcile(readingFirst = false)
            }
        }
    }

    private fun cancelDeadline() {
        deadline?.cancel()
        deadline = null
    }

    private fun claimPublishing(ticket: Ticket) {
        awaitsServedTruth = false
        markReceived(ticket, false)
    }

    private fun markReceived(ticket: Ticket, next: Boolean) {
        received = next
        store.saveReceived(ticket.account, next)
    }

    private fun wipe(ticket: Ticket) {
        awaitsServedTruth = false
        adopt(ticket, SharedLocationRoster.EMPTY)
        markReceived(ticket, false)
        rememberStart(ticket, null)
        stopFollowingDevice()
        cancelDeadline()
    }

    /**
     * UN SEUL APPAREIL PUBLIE (#18580), iso `followServedStart` du web et d'iOS : la passerelle nomme le dernier démarrage
     * avec position ; s'il diffère de celui de l'accusé d'ici, un autre appareil a partagé après lui. Sans accusé lisible,
     * le démarrage servi est pris pour le sien ; sans `startedAt` (passerelle d'avant), rien ne change.
     */
    private fun yieldsTo(ticket: Ticket, served: String?): Boolean {
        if (served == null) return false
        val mine = publishedStart ?: run {
            rememberStart(ticket, served)
            return false
        }
        return served != mine
    }

    /** La marque « reçue » s'écrit AVANT la liste (processus tué entre les deux : relancé muet), puis le suivi se coupe. */
    private fun yieldPublishing(ticket: Ticket) {
        markReceived(ticket, true)
        rememberStart(ticket, null)
        stopFollowingDevice()
    }

    private fun rememberStart(ticket: Ticket, startedAt: String?) {
        if (publishedStart == startedAt) return
        publishedStart = startedAt
        store.savePublishedStart(ticket.account, startedAt)
    }

    private fun stopFollowingDevice() {
        lastSent = null
        following?.cancel()
        following = null
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

    override fun loadReceived(accountId: String): Boolean = prefs.getBoolean(RECEIVED_PREFIX + accountId, false)

    override fun saveReceived(accountId: String, received: Boolean) {
        val editor = prefs.edit()
        if (received) editor.putBoolean(RECEIVED_PREFIX + accountId, true) else editor.remove(RECEIVED_PREFIX + accountId)
        editor.apply()
    }

    override fun loadPublishedStart(accountId: String): String? = prefs.getString(STARTED_PREFIX + accountId, null)

    override fun savePublishedStart(accountId: String, startedAt: String?) {
        val editor = prefs.edit()
        if (startedAt == null) editor.remove(STARTED_PREFIX + accountId) else editor.putString(STARTED_PREFIX + accountId, startedAt)
        editor.apply()
    }

    private companion object {
        const val FILE_NAME = "meeshy_shared_location_roster"
        const val KEY_PREFIX = "roster."
        const val RECEIVED_PREFIX = "received."
        const val STARTED_PREFIX = "publishedStart."
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

/**
 * La relecture du partage servi a TROIS issues (#19928, iso `SharedLocationServedRead.answer` iOS) : une réponse, une
 * passerelle d'avant `GET /relations/locations/mine` (404, `null`), ou une panne (toute autre issue, levée). Seules les
 * deux premières lèvent l'attente d'un appareil relancé : réduire la panne à « rien » le laissait publier toute la session.
 */
internal fun ownSharedLocationAnswer(
    result: NetworkResult<SharedLocationOwnSnapshotWire>,
    json: Json,
): SharedLocationOwnSnapshot? = when (result) {
    is NetworkResult.Success -> result.data.served(json) ?: throw SharedLocationReadFailed("liste illisible")
    is NetworkResult.Failure ->
        if (result.error.httpStatus == HTTP_NOT_FOUND) null else throw SharedLocationReadFailed(result.error.message)
}

/** Une relecture du partage servi qui n'a rien tranché : panne réseau, 401, 5xx, réponse illisible. */
class SharedLocationReadFailed(reason: String) : Exception(reason)

private const val HTTP_NOT_FOUND = 404
