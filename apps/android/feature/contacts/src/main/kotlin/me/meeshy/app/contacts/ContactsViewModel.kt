package me.meeshy.app.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendRequestListRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

enum class ContactsTab { Contacts, Requests, Discover, Blocked }

data class ContactsUiState(
    val selectedTab: ContactsTab = ContactsTab.Contacts,
    val receivedRequests: List<FriendRequest> = emptyList(),
    val sentRequests: List<FriendRequest> = emptyList(),
    val isLoadingRequests: Boolean = false,
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

    init {
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

    private suspend fun revalidateRequests() {
        try {
            val received = friendRepository.receivedRequests()
            val sent = friendRepository.sentRequests()
            if (received is NetworkResult.Success && sent is NetworkResult.Success) {
                friendshipCache.hydrate(sent = sent.data, received = received.data)
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
        if (removed.receiverId.isNotBlank()) friendshipCache.didCancelRequest(removed.receiverId)
        persistSentAsync(updated)
        viewModelScope.launch {
            val result = runCatching { friendRepository.deleteRequest(requestId) }
                .getOrElse { if (it is CancellationException) throw it else NetworkResult.Failure(toError(it)) }
            finishAction(requestId) {
                if (result is NetworkResult.Failure) {
                    if (removed.receiverId.isNotBlank()) {
                        friendshipCache.didSendRequest(removed.receiverId, removed.id)
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
        if (accepted) friendshipCache.didAcceptRequest(senderId) else friendshipCache.didRejectRequest(senderId)
    }

    private fun rollbackRespondCache(senderId: String, requestId: String, accepted: Boolean) {
        if (senderId.isBlank()) return
        if (accepted) {
            friendshipCache.rollbackAccept(senderId, requestId)
        } else {
            friendshipCache.rollbackReject(senderId, requestId)
        }
    }

    fun dismissError() = _state.update { it.copy(errorMessage = null) }

    private fun finishAction(requestId: String, transform: (ContactsUiState) -> ContactsUiState) {
        _state.update { transform(it).copy(pendingActionIds = it.pendingActionIds - requestId) }
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
