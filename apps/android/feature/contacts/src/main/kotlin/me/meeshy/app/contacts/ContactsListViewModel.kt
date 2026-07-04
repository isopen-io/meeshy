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
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.ContactFilter
import me.meeshy.sdk.model.friend.ContactFilterCounts
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

    /** Per-filter counts for the chip badges, under the active search [query]. */
    val filterCounts: ContactFilterCounts get() = ContactList.counts(friends, query)

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
 * is no dedicated `/friends` endpoint), so [load] first paints the last-persisted
 * roster from the Room-backed [FriendListRepository] for an instant cold-start
 * view (the Android analogue of iOS `CacheCoordinator.friends`), then fetches
 * received + sent requests, folds them into the online-first friend list via the
 * pure [ContactList], writes that roster back through to the cache, and keeps the
 * shared [FriendshipCache] hydrated. It then reconciles the shown list against
 * that cache whenever any other surface (the Requests tab accepting, a profile
 * sheet, a socket event) mutates the friend graph: removals apply locally (and are
 * written through so the cache stays consistent without a refetch), additions
 * trigger a single silent refetch.
 */
@HiltViewModel
class ContactsListViewModel @Inject constructor(
    private val friendRepository: FriendRepository,
    private val friendListRepository: FriendListRepository,
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

    fun load() {
        viewModelScope.launch {
            paintFromCache()
            revalidate()
        }
    }

    /**
     * Cache-first cold paint (ARCHITECTURE.md §4): if nothing is on screen yet,
     * replay the last-persisted roster from Room so the tab shows friends instantly
     * — no blocking spinner when the cache has data. A `null` snapshot is a cold
     * cache (never synced) → keep the skeleton until the network answers; a
     * synced-but-empty snapshot settles to an empty roster with no skeleton.
     */
    private suspend fun paintFromCache() {
        if (_state.value.friends.isNotEmpty()) return
        val cached = friendListRepository.cachedSnapshot()
        _state.update {
            if (cached == null) it.copy(isLoading = true)
            else it.copy(friends = cached, isLoading = false)
        }
    }

    private fun refetch() {
        viewModelScope.launch { revalidate() }
    }

    private suspend fun revalidate() {
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
            friendListRepository.persist(friends)
        } else {
            _state.update {
                it.copy(
                    isLoading = false,
                    errorMessage = if (it.friends.isEmpty()) firstError(received, sent) else it.errorMessage,
                )
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
            viewModelScope.launch { friendListRepository.persist(result.friends) }
        }
        if (result.needsRefetch) refetch()
    }

    private fun firstError(vararg results: NetworkResult<*>): String? =
        results.filterIsInstance<NetworkResult.Failure>().firstOrNull()?.error?.message

    private companion object {
        const val FETCH_LIMIT = 100
    }
}
