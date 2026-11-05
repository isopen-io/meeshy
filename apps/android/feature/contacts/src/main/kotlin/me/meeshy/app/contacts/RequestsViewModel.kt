package me.meeshy.app.contacts

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendConnectionCoordinator
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendRequestListRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestDirection
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.model.friend.PendingGraphDelta
import me.meeshy.sdk.model.friend.PendingRequestRoster
import me.meeshy.sdk.model.friend.RequestRemoval
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.socket.MessageSocketManager
import javax.inject.Inject

/** Les deux directions de l'écran des demandes (les deux pastilles « Reçues » / « Envoyées »). */
enum class RequestsDirection { Received, Sent }

/** L'état d'une direction : ses lignes, si elle a déjà été servie (cache ou réseau) et sa pagination. */
@Immutable
data class RequestsListState(
    val rows: List<FriendRequest> = emptyList(),
    /** `false` = direction froide (jamais synchronisée) ; une direction servie mais vide est `true`. */
    val synced: Boolean = false,
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
    val isLoadingMore: Boolean = false,
    val loadError: String? = null,
) {
    /** Une erreur de chargement ne se montre que s'il n'y a aucune ligne à garder à l'écran. */
    val shownError: String? get() = loadError?.takeIf { rows.isEmpty() }
}

@Immutable
data class RequestsUiState(
    val direction: RequestsDirection = RequestsDirection.Received,
    val received: RequestsListState = RequestsListState(),
    val sent: RequestsListState = RequestsListState(),
    val isRefreshing: Boolean = false,
) {
    val selected: RequestsListState
        get() = if (direction == RequestsDirection.Received) received else sent

    /** Le squelette partagé n'apparaît que si LES DEUX directions sont froides. */
    val showSkeleton: Boolean get() = !received.synced && !sent.synced

    fun list(of: RequestsDirection): RequestsListState = if (of == RequestsDirection.Received) received else sent
}

/**
 * L'écran des demandes d'amis (iso `RequestsViewModel` d'iOS) : cache-first par direction, accepter / refuser /
 * annuler optimistes et durables par [FriendConnectionCoordinator] (outbox), pagination par curseur, repeinture
 * sur `user:updated`. Un refus définitif de la file ramène la ligne SEULE à sa place (le cache d'amitié repasse
 * en attente, [PendingGraphDelta] le lit).
 */
@HiltViewModel
class RequestsViewModel @Inject constructor(
    private val friendRepository: FriendRepository,
    private val requestListRepository: FriendRequestListRepository,
    private val coordinator: FriendConnectionCoordinator,
    private val friendshipCache: FriendshipCache,
    private val notificationRepository: NotificationRepository,
    private val blockCache: BlockCache = BlockCache(),
    private val messageSocket: MessageSocketManager? = null,
) : ViewModel() {

    private val _state = MutableStateFlow(RequestsUiState())
    val state: StateFlow<RequestsUiState> = _state.asStateFlow()

    /** Les toasts et haptiques des gestes (accepter, refuser, annuler), y compris l'échec asynchrone de la file. */
    val feedback: Flow<ConnectionFeedback> = coordinator.feedback

    private val removalsByUser = mutableMapOf<String, RequestRemoval>()
    private var lastReceived: Set<String> = friendshipCache.currentReceivedPendingSenderIds
    private var lastSent: Set<String> = friendshipCache.currentSentPendingReceiverIds
    private var applyingOwnChange = false

    init {
        observeFriendshipCache()
        observeUserUpdates()
        load()
    }

    fun selectDirection(direction: RequestsDirection) = _state.update { it.copy(direction = direction) }

    /** Marque lues les notifications de demande d'ami à l'ouverture de l'écran autonome. */
    fun markNotificationsRead() {
        viewModelScope.launch {
            runCatching { notificationRepository.markTypesAsRead(READ_ON_OPEN_TYPES) }
                .onFailure { if (it is CancellationException) throw it }
        }
    }

    fun load() {
        viewModelScope.launch {
            paintFromCache()
            RequestsDirection.entries.forEach { revalidate(it) }
        }
    }

    /** Pull-to-refresh : la direction visible force le réseau, jamais bornée par le cache. */
    fun refresh() {
        val direction = _state.value.direction
        viewModelScope.launch {
            _state.update { it.copy(isRefreshing = true) }
            try {
                revalidate(direction)
            } finally {
                _state.update { it.copy(isRefreshing = false) }
            }
        }
    }

    /** La dernière ligne de [direction] est apparue : la page suivante, sans doublon. */
    fun loadMore(direction: RequestsDirection) {
        val current = _state.value.list(direction)
        val cursor = current.nextCursor
        if (!current.hasMore || current.isLoadingMore || cursor == null) return
        updateList(direction) { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            val result = safely { friendRepository.pendingRequests(direction.wire(), cursor, PAGE_SIZE) }
            updateList(direction) { list ->
                when (result) {
                    is NetworkResult.Success -> list.copy(
                        rows = PendingRequestRoster.appendingNew(list.rows, kept(result.data.requests)),
                        nextCursor = result.data.nextCursor,
                        hasMore = result.data.hasMore,
                        isLoadingMore = false,
                    )
                    is NetworkResult.Failure -> list.copy(isLoadingMore = false)
                }
            }
        }
    }

    fun accept(requestId: String) = respond(requestId, accepted = true)

    fun decline(requestId: String) = respond(requestId, accepted = false)

    private fun respond(requestId: String, accepted: Boolean) {
        val removal = RequestRemoval.of(requestId, _state.value.received.rows) ?: return
        val request = removal.request
        val userId = request.senderId
        if (userId.isBlank()) return
        ownCacheChange {
            if (friendshipCache.status(userId) !is FriendshipStatus.PendingReceived) {
                friendshipCache.didReceiveRequest(userId, request.id)
            }
        }
        removalsByUser[userId] = removal
        removeRow(RequestsDirection.Received, requestId)
        if (accepted) coordinator.accept(userId, request.sender) else coordinator.reject(userId)
    }

    fun cancel(requestId: String) {
        val removal = RequestRemoval.of(requestId, _state.value.sent.rows) ?: return
        val request = removal.request
        val userId = request.receiverId
        if (userId.isBlank()) return
        ownCacheChange {
            if (friendshipCache.status(userId) !is FriendshipStatus.PendingSent) {
                friendshipCache.didSendRequest(userId, request.id)
            }
        }
        removalsByUser[userId] = removal
        removeRow(RequestsDirection.Sent, requestId)
        coordinator.cancel(userId)
    }

    private fun removeRow(direction: RequestsDirection, requestId: String) {
        updateList(direction) { list -> list.copy(rows = list.rows.filterNot { it.id == requestId }) }
        persist(direction)
    }

    private suspend fun paintFromCache() {
        if (_state.value.received.synced || _state.value.sent.synced) return
        val received = requestListRepository.cachedReceived()
        val sent = requestListRepository.cachedSent()
        _state.update {
            it.copy(
                received = received?.let { rows -> it.received.copy(rows = rows, synced = true) } ?: it.received,
                sent = sent?.let { rows -> it.sent.copy(rows = rows, synced = true) } ?: it.sent,
            )
        }
    }

    private suspend fun revalidate(direction: RequestsDirection) {
        val ticket = requestListRepository.ticket()
        val result = safely { friendRepository.pendingRequests(direction.wire(), null, PAGE_SIZE) }
        when (result) {
            is NetworkResult.Success -> {
                removalsByUser.clear()
                val rows = kept(result.data.requests)
                updateList(direction) {
                    it.copy(
                        rows = rows,
                        synced = true,
                        nextCursor = result.data.nextCursor,
                        hasMore = result.data.hasMore,
                        loadError = null,
                    )
                }
                if (direction == RequestsDirection.Received) {
                    requestListRepository.persistReceived(rows, ticket)
                } else {
                    requestListRepository.persistSent(rows, ticket)
                }
                absorbGraph()
            }
            is NetworkResult.Failure -> updateList(direction) { it.copy(loadError = result.error.message) }
        }
    }

    private fun kept(requests: List<FriendRequest>): List<FriendRequest> =
        BlockedExclusion.requests(PendingRequestRoster.pendingOnly(requests), blockCache.currentBlockedIds)

    private fun observeFriendshipCache() {
        viewModelScope.launch {
            friendshipCache.version.drop(1).collect {
                if (applyingOwnChange) return@collect
                reconcile(
                    RequestsDirection.Received,
                    PendingGraphDelta.between(lastReceived, friendshipCache.currentReceivedPendingSenderIds, removalsByUser.keys),
                )
                reconcile(
                    RequestsDirection.Sent,
                    PendingGraphDelta.between(lastSent, friendshipCache.currentSentPendingReceiverIds, removalsByUser.keys),
                )
                absorbGraph()
            }
        }
    }

    private fun reconcile(direction: RequestsDirection, delta: PendingGraphDelta) {
        if (delta.isEmpty) return
        delta.returned.forEach { userId -> restore(direction, userId) }
        if (delta.gone.isNotEmpty()) {
            updateList(direction) { list ->
                list.copy(rows = list.rows.filterNot { it.counterpartId(direction) in delta.gone })
            }
        }
        if (delta.arrived.isNotEmpty()) viewModelScope.launch { revalidate(direction) }
    }

    private fun restore(direction: RequestsDirection, userId: String) {
        val removal = removalsByUser.remove(userId) ?: return
        updateList(direction) { list ->
            list.copy(rows = PendingRequestRoster.restoring(removal.request, removal.index, list.rows))
        }
        persist(direction)
    }

    private inline fun ownCacheChange(mutation: () -> Unit) {
        applyingOwnChange = true
        try {
            mutation()
        } finally {
            applyingOwnChange = false
            absorbGraph()
        }
    }

    private fun absorbGraph() {
        lastReceived = friendshipCache.currentReceivedPendingSenderIds
        lastSent = friendshipCache.currentSentPendingReceiverIds
    }

    private fun observeUserUpdates() {
        val updates = messageSocket?.userUpdated ?: return
        viewModelScope.launch {
            updates.collect { event ->
                try {
                    repaint(event)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    Unit
                }
            }
        }
    }

    private fun repaint(event: UserUpdatedEvent) {
        RequestsDirection.entries.forEach { direction ->
            val next = PendingRequestRoster.repainted(_state.value.list(direction).rows, event) ?: return@forEach
            updateList(direction) { it.copy(rows = next) }
            persist(direction)
        }
    }

    private fun persist(direction: RequestsDirection) {
        val ticket = requestListRepository.ticket()
        val rows = _state.value.list(direction).rows
        viewModelScope.launch {
            if (direction == RequestsDirection.Received) {
                requestListRepository.persistReceived(rows, ticket)
            } else {
                requestListRepository.persistSent(rows, ticket)
            }
        }
    }

    private fun updateList(direction: RequestsDirection, transform: (RequestsListState) -> RequestsListState) {
        _state.update {
            if (direction == RequestsDirection.Received) it.copy(received = transform(it.received))
            else it.copy(sent = transform(it.sent))
        }
    }

    private suspend fun <T> safely(call: suspend () -> NetworkResult<T>): NetworkResult<T> =
        try {
            call()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            NetworkResult.Failure(me.meeshy.sdk.net.ApiError(e.message ?: "Unknown error"))
        }

    private fun RequestsDirection.wire(): FriendRequestDirection =
        if (this == RequestsDirection.Received) FriendRequestDirection.Received else FriendRequestDirection.Sent

    private fun FriendRequest.counterpartId(direction: RequestsDirection): String =
        if (direction == RequestsDirection.Received) senderId else receiverId

    companion object {
        const val PAGE_SIZE: Int = 30
        internal val READ_ON_OPEN_TYPES: List<String> =
            listOf("friend_request", "contact_request", "friend_accepted", "contact_accepted")
    }
}
