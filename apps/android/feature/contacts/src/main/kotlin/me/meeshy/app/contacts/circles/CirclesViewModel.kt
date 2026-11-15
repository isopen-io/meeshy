package me.meeshy.app.contacts.circles

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestDirection
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.friend.resolvedName
import me.meeshy.sdk.model.relation.CirclePerson
import me.meeshy.sdk.model.relation.CircleSection
import me.meeshy.sdk.model.relation.CirclesLayout
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationLevelRaisedEvent
import me.meeshy.sdk.model.relation.RelationLink
import me.meeshy.sdk.model.relation.RelationRaiseOffer
import me.meeshy.sdk.model.relation.RelationsConfig
import me.meeshy.sdk.model.relation.requestedLevel
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.relation.CirclesGateway
import me.meeshy.sdk.socket.RelationSocketEventsManager

/** Où en est la lecture des liens — miroir du `LoadState` que `CacheFirstLoader` pose sur iOS. */
enum class CirclesLoad { IDLE, LOADING, CACHED, LOADED, OFFLINE, ERROR }

/** La personne avec qui le rituel du Sang s'ouvre. */
data class CircleRitualTarget(val userId: String, val name: String)

data class CirclesUiState(
    val links: List<RelationLink> = emptyList(),
    val people: Map<String, CirclePerson> = emptyMap(),
    val config: RelationsConfig? = null,
    val load: CirclesLoad = CirclesLoad.IDLE,
    val isRefreshing: Boolean = false,
    val incomingRaises: List<FriendRequest> = emptyList(),
    val outgoingRaises: List<FriendRequest> = emptyList(),
    val pendingTargets: Map<String, RelationLevel> = emptyMap(),
) {
    val visibleLinks: List<RelationLink> get() = CirclesLayout.visible(links)

    val sections: List<CircleSection> get() = CirclesLayout.sections(links, people)

    /** Squelette : cache FROID et rien encore peint — jamais un spinner sur un cache non vide. */
    val showsSkeleton: Boolean get() = visibleLinks.isEmpty() && (load == CirclesLoad.LOADING || load == CirclesLoad.IDLE)

    val isEmptyState: Boolean
        get() = visibleLinks.isEmpty() && (load == CirclesLoad.LOADED || load == CirclesLoad.CACHED)

    val isOffline: Boolean get() = load == CirclesLoad.OFFLINE

    val hasError: Boolean get() = load == CirclesLoad.ERROR

    /** Le cran que j'ai demandé à cette personne et qui attend sa réponse : l'optimiste d'abord, puis la demande servie. */
    fun pendingLevel(userId: String): RelationLevel? =
        pendingTargets[userId] ?: outgoingRaises.firstOrNull { it.receiverId == userId }?.requestedLevel
}

/** Les flux du lien que l'écran écoute ; la production les tire de [RelationSocketEventsManager]. */
data class CircleEvents(val levelRaised: Flow<RelationLevelRaisedEvent>, val ritual: RitualEvents)

/**
 * « Mes cercles » (#13938) — miroir de `CirclesViewModel.swift` : mes liens par niveau, ce qui manque pour monter, mes
 * demandes de montée, et le rituel du Sang.
 *
 * - **Cache d'abord** : la liste se peint depuis le disque, jamais un spinner sur un cache non vide.
 * - **Optimiste** : une demande de montée s'applique localement AVANT le réseau (instantané → local → file durable → retour
 *   arrière si la file renonce).
 * - **Le client ne décide pas** : la loi de demande sert à ne pas PROPOSER ce que le serveur refusera.
 */
@HiltViewModel
class CirclesViewModel internal constructor(
    private val gateway: CirclesGateway,
    private val network: NetworkMonitor,
    private val events: CircleEvents,
) : ViewModel() {

    @Inject
    constructor(gateway: CirclesGateway, network: NetworkMonitor, sockets: RelationSocketEventsManager) : this(
        gateway,
        network,
        CircleEvents(
            levelRaised = sockets.levelRaised,
            ritual = RitualEvents(sockets.ritualStarted, sockets.ritualProgress, sockets.ritualCompleted),
        ),
    )

    private val _state = MutableStateFlow(CirclesUiState())
    val state: StateFlow<CirclesUiState> = _state.asStateFlow()

    private val _feedback = MutableSharedFlow<ConnectionFeedback>(extraBufferCapacity = 16)

    /** L'issue d'une demande, d'une réponse ou d'une annulation (toast + haptique), comme l'onglet Demandes. */
    val feedback: SharedFlow<ConnectionFeedback> = _feedback.asSharedFlow()

    private val _ritual = MutableStateFlow<BloodRitualController?>(null)

    /** Le rituel ouvert, ou `null`. */
    val ritual: StateFlow<BloodRitualController?> = _ritual.asStateFlow()

    private var loadJob: Job? = null
    private val raiseCmids = mutableMapOf<String, String>()
    private val respondCmids = mutableMapOf<String, Pair<FriendRequest, Boolean>>()

    init {
        viewModelScope.launch { events.levelRaised.collect { receiveLevelRaised(it) } }
        viewModelScope.launch { gateway.exhausted.collect { receiveExhausted(it) } }
    }

    // Lecture

    fun load(forceNetwork: Boolean = false) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            if (forceNetwork) _state.update { it.copy(isRefreshing = true) } else paintFromCache()
            revalidate()
            _state.update { it.copy(isRefreshing = false) }
            resolveMissingPeople()
            loadRequests()
            gateway.config()?.let { served -> _state.update { it.copy(config = served) } }
        }
    }

    private suspend fun paintFromCache() {
        if (_state.value.links.isNotEmpty()) return
        val cached = gateway.cachedLinks()
        _state.update {
            if (cached == null) it.copy(load = CirclesLoad.LOADING) else it.copy(links = cached, load = CirclesLoad.CACHED)
        }
        resolveMissingPeople()
    }

    private suspend fun revalidate() {
        if (!network.isOnline.value) {
            _state.update { it.copy(load = CirclesLoad.OFFLINE) }
            return
        }
        when (val served = gateway.refreshLinks()) {
            is NetworkResult.Success -> _state.update { it.copy(links = served.data, load = CirclesLoad.LOADED) }
            is NetworkResult.Failure -> _state.update { it.copy(load = CirclesLoad.ERROR) }
        }
    }

    private suspend fun resolveMissingPeople() {
        val known = _state.value.people
        val unresolved = _state.value.visibleLinks.map { it.userId }.filterNot { it in known }
        if (unresolved.isEmpty()) return
        val resolved = gateway.people(unresolved)
        _state.update { it.copy(people = it.people + resolved) }
    }

    private suspend fun loadRequests() {
        val links = _state.value.links
        gateway.pendingRequests(FriendRequestDirection.Received)?.let { received ->
            _state.update { it.copy(incomingRaises = CirclesLayout.raises(received, links, incoming = true)) }
        }
        gateway.pendingRequests(FriendRequestDirection.Sent)?.let { sent ->
            _state.update { it.copy(outgoingRaises = CirclesLayout.raises(sent, links, incoming = false)) }
        }
    }

    /** Le nom d'une personne : l'annuaire d'abord, puis ce que porte la demande ; jamais inventé (l'écran écrit « ? »). */
    fun nameOf(userId: String, fallback: String? = null): String? =
        _state.value.people[userId]?.name ?: fallback?.takeIf { it.isNotBlank() }

    // Demander un cran (optimiste)

    fun requestRaise(link: RelationLink) {
        val offer = link.raiseOffer() as? RelationRaiseOffer.Available ?: return
        if (_state.value.pendingLevel(link.userId) != null) return
        val snapshot = _state.value.pendingTargets
        _state.update { it.copy(pendingTargets = it.pendingTargets + (link.userId to offer.target)) }
        viewModelScope.launch {
            val cmid = gateway.enqueueRaise(link.userId, offer.target)
            if (cmid == null) {
                _state.update { it.copy(pendingTargets = snapshot) }
                _feedback.tryEmit(ConnectionFeedback.RequestSendFailed)
            } else {
                raiseCmids[cmid] = link.userId
                _feedback.tryEmit(ConnectionFeedback.RequestSent)
            }
        }
    }

    // Répondre à une demande de montée

    /**
     * Une demande de SANG ne s'accepte pas par `PATCH accept` (le serveur répond `RELATION_RITUAL_REQUIRED`) : on ouvre le
     * rituel, seul chemin vers le Sang. La demande reste affichée jusqu'au scellement.
     */
    fun accept(request: FriendRequest) {
        if (request.requestedLevel == RelationLevel.BLOOD) {
            openRitual(request.senderId, request.sender?.resolvedName)
            return
        }
        respond(request, accept = true)
    }

    fun decline(request: FriendRequest) = respond(request, accept = false)

    private fun respond(request: FriendRequest, accept: Boolean) {
        val snapshot = _state.value.incomingRaises
        if (snapshot.none { it.id == request.id }) return
        _state.update { it.copy(incomingRaises = it.incomingRaises.filterNot { r -> r.id == request.id }) }
        viewModelScope.launch {
            val cmid = gateway.enqueueRespond(request, accept)
            if (cmid == null) {
                _state.update { it.copy(incomingRaises = snapshot) }
                _feedback.tryEmit(if (accept) ConnectionFeedback.AcceptFailed else ConnectionFeedback.DeclineFailed)
            } else {
                respondCmids[cmid] = request to accept
                _feedback.tryEmit(if (accept) ConnectionFeedback.ConnectionAccepted else ConnectionFeedback.RequestDeclined)
            }
        }
    }

    /** Retirer une demande que j'ai envoyée, en direct (elle suppose le réseau). */
    fun cancel(request: FriendRequest) {
        val snapshot = _state.value.outgoingRaises
        if (snapshot.none { it.id == request.id }) return
        _state.update { it.copy(outgoingRaises = it.outgoingRaises.filterNot { r -> r.id == request.id }) }
        viewModelScope.launch {
            if (gateway.cancel(request)) {
                _feedback.tryEmit(ConnectionFeedback.RequestCancelled)
            } else {
                _state.update { it.copy(outgoingRaises = snapshot) }
                _feedback.tryEmit(ConnectionFeedback.CancelFailed)
            }
        }
    }

    private fun receiveExhausted(cmid: String) {
        raiseCmids.remove(cmid)?.let { userId ->
            _state.update { it.copy(pendingTargets = it.pendingTargets - userId) }
            _feedback.tryEmit(ConnectionFeedback.RequestSendFailed)
        }
        respondCmids.remove(cmid)?.let { (request, accepted) ->
            _state.update { state ->
                if (state.incomingRaises.any { it.id == request.id }) {
                    state
                } else {
                    state.copy(incomingRaises = (state.incomingRaises + request).sortedByDescending { it.createdAt.orEmpty() })
                }
            }
            _feedback.tryEmit(if (accepted) ConnectionFeedback.AcceptFailed else ConnectionFeedback.DeclineFailed)
        }
    }

    // Le rituel

    fun openRitual(userId: String, fallbackName: String? = null) {
        _ritual.value?.close()
        _ritual.value = BloodRitualController(
            userId = userId,
            displayName = nameOf(userId, fallbackName).orEmpty(),
            gateway = gateway,
            isOnline = { network.isOnline.value },
            events = events.ritual,
            scope = viewModelScope,
        )
    }

    /** Le rituel s'est refermé (scellé ou abandonné) : la feuille part, les cercles se relisent. */
    fun ritualFinished() {
        _ritual.value?.close()
        _ritual.value = null
        load(forceNetwork = true)
    }

    // Événements du lien

    /** Le niveau effectif a monté : ma demande est soldée, on relit les cercles. */
    private fun receiveLevelRaised(event: RelationLevelRaisedEvent) {
        _state.update { it.copy(pendingTargets = it.pendingTargets - event.userId) }
        load(forceNetwork = true)
    }

    override fun onCleared() {
        _ritual.value?.close()
        super.onCleared()
    }
}
