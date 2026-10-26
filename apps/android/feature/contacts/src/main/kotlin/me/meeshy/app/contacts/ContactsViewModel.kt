package me.meeshy.app.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendRequestListRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

enum class ContactsTab { Contacts, Requests, Discover, Blocked }

data class ContactsUiState(
    val selectedTab: ContactsTab = ContactsTab.Contacts,
    val receivedRequests: List<FriendRequest> = emptyList(),
    val sentRequests: List<FriendRequest> = emptyList(),
    val isLoadingRequests: Boolean = false,
    val isRefreshing: Boolean = false,
    val pendingActionIds: Set<String> = emptySet(),
    val errorMessage: String? = null,
)

@HiltViewModel
class ContactsViewModel @Inject constructor(
    private val friendRepository: FriendRepository,
    private val friendRequestListRepository: FriendRequestListRepository,
    private val friendshipCache: FriendshipCache = FriendshipCache(),
) : ViewModel() {

    private val _state = MutableStateFlow(ContactsUiState())
    val state: StateFlow<ContactsUiState> = _state.asStateFlow()

    private val _feedback = MutableSharedFlow<ConnectionFeedback>(extraBufferCapacity = 16)

    /** One-shot outcome of an accept / decline / cancel (toast + haptic), as on iOS. */
    val feedback: SharedFlow<ConnectionFeedback> = _feedback.asSharedFlow()

    private var lastReconciledGraph: PendingGraph = friendshipCache.pendingGraph()
    private var revalidating = false
    private var changedWhileBusy = false
    private var applyingOwnChange = false
    private val busy: Boolean get() = revalidating || _state.value.pendingActionIds.isNotEmpty()

    init {
        observeFriendshipCache()
        loadRequests()
    }

    fun selectTab(tab: ContactsTab) = _state.update { it.copy(selectedTab = tab) }

    fun loadRequests() {
        viewModelScope.launch {
            paintFromCache()
            revalidateRequests()
        }
    }

    /**
     * Cache-first cold paint (ARCHITECTURE.md §4): if nothing is on screen yet,
     * replay the last-persisted received/sent rosters from Room so the Requests
     * tab shows them instantly — no blocking spinner when the cache has data.
     * Both directions cold (never synced) keeps the skeleton until the network
     * answers; a synced-but-empty direction settles with no skeleton.
     */
    private suspend fun paintFromCache() {
        if (_state.value.receivedRequests.isNotEmpty() || _state.value.sentRequests.isNotEmpty()) return
        val cachedReceived = friendRequestListRepository.cachedReceived()
        val cachedSent = friendRequestListRepository.cachedSent()
        _state.update {
            if (cachedReceived == null && cachedSent == null) {
                it.copy(isLoadingRequests = true)
            } else {
                it.copy(
                    receivedRequests = cachedReceived ?: it.receivedRequests,
                    sentRequests = cachedSent ?: it.sentRequests,
                    isLoadingRequests = false,
                )
            }
        }
    }

    /**
     * A request received or accepted live (the notification socket patches [FriendshipCache]) or
     * answered from another surface changes the pending sets under this tab: one silent refetch
     * repaints both lists. Our own optimistic actions and revalidations reconcile the graph the
     * moment they move the cache, so only an EXTERNAL change reaches here. One that lands while a
     * fetch or an answer is in flight is deferred, never dropped: the fetch may have been served
     * before the server knew it, and its hydrate would erase the live patch.
     */
    private fun observeFriendshipCache() {
        viewModelScope.launch {
            friendshipCache.version.drop(1).collect {
                if (applyingOwnChange) return@collect
                val graph = friendshipCache.pendingGraph()
                if (graph == lastReconciledGraph) return@collect
                lastReconciledGraph = graph
                if (busy) changedWhileBusy = true else loadRequests()
            }
        }
    }

    /**
     * Runs one of our own cache mutations and reconciles the graph right after it — a collector
     * resumed inline by the emission (Main.immediate) sees the guard, a deferred one sees the
     * reconciled graph; neither mistakes it for an external change.
     */
    private inline fun ownCacheChange(mutation: () -> Unit) {
        applyingOwnChange = true
        try {
            mutation()
        } finally {
            applyingOwnChange = false
            absorbOwnCacheChange()
        }
    }

    private fun absorbOwnCacheChange() {
        lastReconciledGraph = friendshipCache.pendingGraph()
    }

    private fun replayDeferredChange() {
        if (!changedWhileBusy || busy) return
        changedWhileBusy = false
        loadRequests()
    }

    /** Pull-to-refresh: always asks the network, never gated by the cache. */
    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isRefreshing = true) }
            try {
                revalidateRequests()
            } finally {
                _state.update { it.copy(isRefreshing = false) }
            }
        }
    }

    private suspend fun revalidateRequests() {
        revalidating = true
        try {
            fetchAndPublishRequests()
        } finally {
            absorbOwnCacheChange()
            revalidating = false
            replayDeferredChange()
        }
    }

    private suspend fun fetchAndPublishRequests() {
        try {
            val received = friendRepository.receivedRequests()
            val sent = friendRepository.sentRequests()
            if (received is NetworkResult.Success && sent is NetworkResult.Success) {
                ownCacheChange { friendshipCache.hydrate(sent = sent.data, received = received.data) }
            }
            val bothSucceeded = received is NetworkResult.Success && sent is NetworkResult.Success
            _state.update { current ->
                current.copy(
                    receivedRequests = (received as? NetworkResult.Success)?.data ?: current.receivedRequests,
                    sentRequests = (sent as? NetworkResult.Success)?.data ?: current.sentRequests,
                    isLoadingRequests = false,
                    errorMessage = when {
                        bothSucceeded -> null
                        current.receivedRequests.isEmpty() && current.sentRequests.isEmpty() -> firstError(received, sent)
                        else -> current.errorMessage
                    },
                )
            }
            if (received is NetworkResult.Success) friendRequestListRepository.persistReceived(received.data)
            if (sent is NetworkResult.Success) friendRequestListRepository.persistSent(sent.data)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _state.update { it.copy(isLoadingRequests = false, errorMessage = e.message) }
        }
    }

    fun acceptRequest(requestId: String) = respondToReceived(requestId, accepted = true)

    fun declineRequest(requestId: String) = respondToReceived(requestId, accepted = false)

    private fun respondToReceived(requestId: String, accepted: Boolean) {
        val snapshot = _state.value.receivedRequests
        val removed = snapshot.firstOrNull { it.id == requestId } ?: return
        val updated = snapshot.filterNot { it.id == requestId }
        _state.update {
            it.copy(
                receivedRequests = updated,
                pendingActionIds = it.pendingActionIds + requestId,
                errorMessage = null,
            )
        }
        applyRespondToCache(removed.senderId, accepted)
        persistReceivedAsync(updated)
        viewModelScope.launch {
            val result = runCatching { friendRepository.respond(requestId, accepted) }
                .getOrElse { if (it is CancellationException) throw it else NetworkResult.Failure(toError(it)) }
            _feedback.tryEmit(respondFeedback(accepted, succeeded = result !is NetworkResult.Failure))
            finishAction(requestId) {
                if (result is NetworkResult.Failure) {
                    rollbackRespondCache(removed.senderId, removed.id, accepted)
                    val restored = restore(it.receivedRequests, snapshot, removed)
                    persistReceivedAsync(restored)
                    it.copy(
                        receivedRequests = restored,
                        errorMessage = result.error.message,
                    )
                } else it
            }
        }
    }

    fun cancelRequest(requestId: String) {
        val snapshot = _state.value.sentRequests
        val removed = snapshot.firstOrNull { it.id == requestId } ?: return
        val updated = snapshot.filterNot { it.id == requestId }
        _state.update {
            it.copy(
                sentRequests = updated,
                pendingActionIds = it.pendingActionIds + requestId,
                errorMessage = null,
            )
        }
        if (removed.receiverId.isNotBlank()) ownCacheChange { friendshipCache.didCancelRequest(removed.receiverId) }
        persistSentAsync(updated)
        viewModelScope.launch {
            val result = runCatching { friendRepository.deleteRequest(requestId) }
                .getOrElse { if (it is CancellationException) throw it else NetworkResult.Failure(toError(it)) }
            _feedback.tryEmit(
                if (result is NetworkResult.Failure) ConnectionFeedback.CancelFailed else ConnectionFeedback.RequestCancelled,
            )
            finishAction(requestId) {
                if (result is NetworkResult.Failure) {
                    if (removed.receiverId.isNotBlank()) {
                        ownCacheChange { friendshipCache.didSendRequest(removed.receiverId, removed.id) }
                    }
                    val restored = restore(it.sentRequests, snapshot, removed)
                    persistSentAsync(restored)
                    it.copy(
                        sentRequests = restored,
                        errorMessage = result.error.message,
                    )
                } else it
            }
        }
    }

    private fun persistReceivedAsync(requests: List<FriendRequest>) {
        viewModelScope.launch { friendRequestListRepository.persistReceived(requests) }
    }

    private fun persistSentAsync(requests: List<FriendRequest>) {
        viewModelScope.launch { friendRequestListRepository.persistSent(requests) }
    }

    private fun applyRespondToCache(senderId: String, accepted: Boolean) {
        if (senderId.isBlank()) return
        ownCacheChange {
            if (accepted) friendshipCache.didAcceptRequest(senderId) else friendshipCache.didRejectRequest(senderId)
        }
    }

    private fun rollbackRespondCache(senderId: String, requestId: String, accepted: Boolean) {
        if (senderId.isBlank()) return
        ownCacheChange {
            if (accepted) {
                friendshipCache.rollbackAccept(senderId, requestId)
            } else {
                friendshipCache.rollbackReject(senderId, requestId)
            }
        }
    }

    fun dismissError() = _state.update { it.copy(errorMessage = null) }

    private fun respondFeedback(accepted: Boolean, succeeded: Boolean): ConnectionFeedback = when {
        accepted && succeeded -> ConnectionFeedback.ConnectionAccepted
        accepted -> ConnectionFeedback.AcceptFailed
        succeeded -> ConnectionFeedback.RequestDeclined
        else -> ConnectionFeedback.DeclineFailed
    }

    private fun finishAction(requestId: String, transform: (ContactsUiState) -> ContactsUiState) {
        _state.update { transform(it).copy(pendingActionIds = it.pendingActionIds - requestId) }
        replayDeferredChange()
    }

    private fun restore(
        current: List<FriendRequest>,
        snapshot: List<FriendRequest>,
        removed: FriendRequest,
    ): List<FriendRequest> {
        if (current.any { it.id == removed.id }) return current
        val index = snapshot.indexOfFirst { it.id == removed.id }.coerceAtLeast(0).coerceAtMost(current.size)
        return current.toMutableList().apply { add(index, removed) }
    }

    private fun firstError(vararg results: NetworkResult<*>): String? =
        results.filterIsInstance<NetworkResult.Failure>().firstOrNull()?.error?.message

    private fun toError(t: Throwable) = me.meeshy.sdk.net.ApiError(t.message ?: "Unknown error")
}

private data class PendingGraph(val received: Set<String>, val sent: Set<String>)

private fun FriendshipCache.pendingGraph() =
    PendingGraph(received = currentReceivedPendingSenderIds, sent = currentSentPendingReceiverIds)
