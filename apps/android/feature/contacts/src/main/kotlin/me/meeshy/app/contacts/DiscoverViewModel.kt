package me.meeshy.app.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockStatusProvider
import me.meeshy.sdk.friend.DiscoverSuggestions
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.friend.SuggestionsRepository
import me.meeshy.sdk.friend.UserRelationshipResolver
import me.meeshy.sdk.model.friend.ConnectAction
import me.meeshy.sdk.model.friend.DiscoverSearch
import me.meeshy.sdk.model.friend.DiscoverSearchAction
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/** A search result plus its derived inline-connect control. */
data class DiscoverRow(
    val user: UserSearchResult,
    val connect: ConnectAction,
)

data class DiscoverUiState(
    val query: String = "",
    val rows: List<DiscoverRow> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val pendingActionIds: Set<String> = emptySet(),
    /** True while the empty-query cache-first suggestions surface owns [rows]. */
    val isShowingSuggestions: Boolean = false,
) {
    /** True when the trimmed query is long enough that a network search is in play. */
    val isSearchActive: Boolean
        get() = DiscoverSearch.action(query) is DiscoverSearchAction.Search

    /** The neutral prompt shows only before either surface has produced rows. */
    val showEmptyPrompt: Boolean
        get() = !isSearchActive && !isShowingSuggestions && rows.isEmpty() && !isLoading

    /** A searchable query settled with zero matches (and no error) → "no users found". */
    val isNoResults: Boolean
        get() = isSearchActive && !isLoading && errorMessage == null && rows.isEmpty()

    /** The suggestions surface settled with nobody to suggest → a quiet empty state. */
    val isSuggestionsEmpty: Boolean
        get() = isShowingSuggestions && !isLoading && errorMessage == null && rows.isEmpty()
}

/**
 * The Discover people-search surface — port of the iOS `DiscoverViewModel` search
 * path. Live user search with an inline connect control per row whose state is the
 * shared [UserRelationshipResolver], so accepting/sending from any other screen
 * flips the button here too (via the [FriendshipCache] version stream).
 *
 * The connect action is genuinely two-way: `connect` queues a friend request
 * durably (the row flips to Pending optimistically and instantly, even offline;
 * the outbox delivers on reconnect) and `acceptReceived` accepts an inbound one
 * optimistically with rollback on failure.
 */
@HiltViewModel
class DiscoverViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val friendRepository: FriendRepository,
    private val suggestionsRepository: SuggestionsRepository,
    private val friendshipCache: FriendshipCache,
    private val blockCache: BlockCache,
    private val workManager: WorkManager,
    sessionRepository: SessionRepository,
) : ViewModel() {

    // Block state now resolves live off the shared `BlockCache` (hydrated by the
    // Blocked tab's `BlockRepository`), closing the resolver's block seam.
    private val resolver = UserRelationshipResolver(
        friendshipCache = friendshipCache,
        blockStatus = BlockStatusProvider { blockCache.isBlocked(it) },
        currentUserId = { sessionRepository.currentUserId },
    )

    private val _state = MutableStateFlow(DiscoverUiState())
    val state: StateFlow<DiscoverUiState> = _state.asStateFlow()

    private var searchJob: Job? = null
    private var suggestionsJob: Job? = null

    init {
        observeFriendshipCache()
    }

    /**
     * Start the cache-first empty-query suggestions surface. Idempotent while it
     * is already streaming, so the UI can call it on every appear (parity with
     * iOS `.task { await vm.loadSuggestions() }`) without re-fetching; the
     * `@Singleton` [SuggestionsRepository] keeps the last list, so a return to the
     * Discover tab paints instantly.
     */
    fun loadSuggestions() {
        if (suggestionsJob?.isActive == true) return
        startSuggestions()
    }

    fun onQueryChanged(rawQuery: String) {
        _state.update { it.copy(query = rawQuery) }
        when (val action = DiscoverSearch.action(rawQuery)) {
            is DiscoverSearchAction.Clear -> {
                searchJob?.cancel()
                searchJob = null
                suggestionsJob?.cancel()
                suggestionsJob = null
                _state.update {
                    it.copy(
                        rows = emptyList(),
                        isLoading = false,
                        errorMessage = null,
                        isShowingSuggestions = false,
                    )
                }
            }
            is DiscoverSearchAction.Search -> search(action.query)
        }
    }

    fun retry() {
        when (val action = DiscoverSearch.action(_state.value.query)) {
            is DiscoverSearchAction.Search -> search(action.query)
            is DiscoverSearchAction.Clear -> startSuggestions()
        }
    }

    private fun startSuggestions() {
        suggestionsJob?.cancel()
        _state.update { it.copy(isShowingSuggestions = true, errorMessage = null) }
        suggestionsJob = viewModelScope.launch {
            suggestionsRepository.suggestionsStream(
                onSyncError = { error ->
                    _state.update { it.copy(isLoading = false, errorMessage = error.message) }
                },
            ).collect { result ->
                val snapshot = DiscoverSuggestions.snapshot(result)
                _state.update {
                    it.copy(
                        rows = rowsFor(snapshot.users),
                        isLoading = snapshot.isLoading,
                        errorMessage = null,
                        isShowingSuggestions = true,
                    )
                }
            }
        }
    }

    private fun search(query: String) {
        suggestionsJob?.cancel()
        suggestionsJob = null
        searchJob?.cancel()
        _state.update { it.copy(isLoading = true, errorMessage = null, isShowingSuggestions = false) }
        searchJob = viewModelScope.launch {
            when (val result = userRepository.searchUsers(query)) {
                is NetworkResult.Success ->
                    _state.update {
                        it.copy(
                            rows = rowsFor(result.data),
                            isLoading = false,
                            errorMessage = null,
                            isShowingSuggestions = false,
                        )
                    }
                is NetworkResult.Failure ->
                    _state.update {
                        it.copy(
                            rows = emptyList(),
                            isLoading = false,
                            errorMessage = result.error.message,
                            isShowingSuggestions = false,
                        )
                    }
            }
        }
    }

    fun connect(userId: String) {
        val row = _state.value.rows.firstOrNull { it.user.id == userId } ?: return
        if (row.connect !is ConnectAction.Connect) return
        if (userId in _state.value.pendingActionIds) return
        _state.update { it.copy(pendingActionIds = it.pendingActionIds + userId) }
        viewModelScope.launch {
            try {
                // Durably queue first, then flip the shared SSOT keyed by the row's
                // own cmid as a placeholder request id — so the cache never shows a
                // Pending with no durable row behind it (a cancellation before the
                // enqueue commits simply leaves the state untouched). The local Room
                // write is sub-millisecond, so the flip is still effectively instant;
                // offline it just waits in the outbox. The worker grafts the real id
                // back on delivery, and a hard exhaust rolls the pending back.
                val cmid = friendRepository.enqueueSendFriendRequest(userId)
                if (cmid != null) {
                    friendshipCache.didSendRequest(userId, cmid)
                    workManager.enqueue(OutboxFlushWorker.buildRequest())
                }
                _state.update { it.copy(pendingActionIds = it.pendingActionIds - userId) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The local enqueue failed before any optimistic flip — surface it.
                _state.update {
                    it.copy(
                        pendingActionIds = it.pendingActionIds - userId,
                        errorMessage = e.message,
                    )
                }
            }
        }
    }

    fun acceptReceived(userId: String) {
        val status = friendshipCache.status(userId)
        if (status !is FriendshipStatus.PendingReceived) return
        if (userId in _state.value.pendingActionIds) return
        val requestId = status.requestId
        _state.update { it.copy(pendingActionIds = it.pendingActionIds + userId) }
        friendshipCache.didAcceptRequest(userId)
        viewModelScope.launch {
            when (val result = friendRepository.respond(requestId, accepted = true)) {
                is NetworkResult.Success ->
                    _state.update { it.copy(pendingActionIds = it.pendingActionIds - userId) }
                is NetworkResult.Failure -> {
                    friendshipCache.rollbackAccept(userId, requestId)
                    _state.update {
                        it.copy(
                            pendingActionIds = it.pendingActionIds - userId,
                            errorMessage = result.error.message,
                        )
                    }
                }
            }
        }
    }

    fun dismissError() = _state.update { it.copy(errorMessage = null) }

    private fun observeFriendshipCache() {
        viewModelScope.launch {
            friendshipCache.version.drop(1).collect { rederiveConnectActions() }
        }
    }

    private fun rederiveConnectActions() {
        _state.update { current ->
            current.copy(rows = current.rows.map { it.copy(connect = connectActionFor(it.user.id)) })
        }
    }

    private fun rowsFor(users: List<UserSearchResult>): List<DiscoverRow> =
        users.map { DiscoverRow(user = it, connect = connectActionFor(it.id)) }

    private fun connectActionFor(userId: String): ConnectAction =
        ConnectAction.from(resolver.resolve(userId))
}
