package me.meeshy.app.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.ContactFilter
import me.meeshy.sdk.model.friend.ContactList
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

data class ContactsListUiState(
    val friends: List<FriendRequestUser> = emptyList(),
    val filter: ContactFilter = ContactFilter.All,
    val query: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
) {
    /** The friend list after the active [filter] and search [query] are applied. */
    val visibleFriends: List<FriendRequestUser> get() = ContactList.visible(friends, filter, query)

    /** True on a cold, non-erroring load with nothing yet — the only time a skeleton shows. */
    val showSkeleton: Boolean get() = isLoading && friends.isEmpty()

    /** True when a filter/search narrows a non-empty roster down to nothing. */
    val isFilteredEmpty: Boolean
        get() = friends.isNotEmpty() && visibleFriends.isEmpty()

    /** True on a settled load whose roster is genuinely empty (cold, no error). */
    val isEmpty: Boolean
        get() = friends.isEmpty() && !isLoading && errorMessage == null
}

/**
 * The Contacts (all-friends) list — port of the iOS `ContactsListViewModel`.
 *
 * The friend graph is exactly the current user's accepted friend requests (there
 * is no dedicated `/friends` endpoint), so [load] fetches received + sent
 * requests, folds them into the online-first friend list via the pure
 * [ContactList], and keeps the shared [FriendshipCache] hydrated. It then
 * reconciles the shown list against that cache whenever any other surface (the
 * Requests tab accepting, a profile sheet, a socket event) mutates the friend
 * graph: removals apply locally, additions trigger a single silent refetch.
 */
@HiltViewModel
class ContactsListViewModel @Inject constructor(
    private val friendRepository: FriendRepository,
    private val friendshipCache: FriendshipCache,
    private val sessionRepository: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ContactsListUiState())
    val state: StateFlow<ContactsListUiState> = _state.asStateFlow()

    private var lastReconciledFriendIds: Set<String> = friendshipCache.currentFriendIds

    init {
        observeFriendshipCache()
        load()
    }

    fun setFilter(filter: ContactFilter) = _state.update { it.copy(filter = filter) }

    fun search(query: String) = _state.update { it.copy(query = query) }

    fun dismissError() = _state.update { it.copy(errorMessage = null) }

    fun load() = fetchFriends(silent = false)

    private fun fetchFriends(silent: Boolean) {
        if (!silent) _state.update { it.copy(isLoading = it.friends.isEmpty()) }
        viewModelScope.launch {
            val received = friendRepository.receivedRequests(offset = 0, limit = FETCH_LIMIT)
            val sent = friendRepository.sentRequests(offset = 0, limit = FETCH_LIMIT)

            if (received is NetworkResult.Success && sent is NetworkResult.Success) {
                friendshipCache.hydrate(sent = sent.data, received = received.data)
                lastReconciledFriendIds = friendshipCache.currentFriendIds
                val friends = ContactList.fromAcceptedRequests(
                    received = received.data,
                    sent = sent.data,
                    currentUserId = sessionRepository.currentUserId.orEmpty(),
                )
                _state.update { it.copy(friends = friends, isLoading = false, errorMessage = null) }
            } else {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = if (it.friends.isEmpty()) firstError(received, sent) else it.errorMessage,
                    )
                }
            }
        }
    }

    private fun observeFriendshipCache() {
        viewModelScope.launch {
            friendshipCache.version.drop(1).collect { onFriendshipCacheChanged() }
        }
    }

    private fun onFriendshipCacheChanged() {
        val cacheIds = friendshipCache.currentFriendIds
        if (cacheIds == lastReconciledFriendIds) return
        lastReconciledFriendIds = cacheIds

        val current = _state.value.friends
        val result = ContactList.reconcile(current, cacheIds)
        if (result.friends != current) {
            _state.update { it.copy(friends = result.friends) }
        }
        if (result.needsRefetch) fetchFriends(silent = true)
    }

    private fun firstError(vararg results: NetworkResult<*>): String? =
        results.filterIsInstance<NetworkResult.Failure>().firstOrNull()?.error?.message

    private companion object {
        const val FETCH_LIMIT = 100
    }
}
