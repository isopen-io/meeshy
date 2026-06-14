package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.sdk.model.ConversationFilters
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import javax.inject.Inject

data class ConversationListUiState(
    val conversations: List<ApiConversation> = emptyList(),
    val isSyncing: Boolean = false,
    val isUserRefreshing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
    val connection: SocketConnectionState = SocketConnectionState.DISCONNECTED,
    val currentUserId: String? = null,
    val selectedFilter: ConversationFilter = ConversationFilter.ALL,
    val searchText: String = "",
    val isSearchActive: Boolean = false,
) {
    val banner: ConnectionBanner get() = bannerFor(connection, isSyncing)

    /** True when a filter/search is narrowing the list yet nothing matches — distinct from a cold-empty cache. */
    val isFilteredEmpty: Boolean
        get() = conversations.isEmpty() && !showSkeleton && errorMessage == null &&
            (selectedFilter != ConversationFilter.ALL || searchText.isNotBlank())
}

@HiltViewModel
class ConversationListViewModel @Inject constructor(
    private val repository: ConversationRepository,
    private val messageSocketManager: MessageSocketManager,
    socketManager: SocketManager,
    sessionRepository: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationListUiState())
    val state: StateFlow<ConversationListUiState> = _state.asStateFlow()

    /** Authoritative, unfiltered cache list; [ConversationListUiState.conversations] is the filtered view. */
    private var rawConversations: List<ApiConversation> = emptyList()

    init {
        viewModelScope.launch {
            repository.conversationsStream(
                onSyncError = { error ->
                    _state.update {
                        it.copy(errorMessage = error.message, showSkeleton = false, isSyncing = false)
                    }
                },
            ).collect { result ->
                rawConversations = result.rawListOr(rawConversations)
                _state.update { it.applyResultFlags(result, rawConversations).withVisible(rawConversations) }
            }
        }

        viewModelScope.launch {
            socketManager.connectionState.collect { connection ->
                _state.update { it.copy(connection = connection) }
            }
        }

        viewModelScope.launch {
            sessionRepository.currentUser.collect { user ->
                _state.update { it.copy(currentUserId = user?.id).withVisible(rawConversations) }
            }
        }

        viewModelScope.launch {
            launch {
                messageSocketManager.unreadUpdated.collect {
                    repository.refresh()
                }
            }
            launch {
                messageSocketManager.messageReceived.collect {
                    repository.refresh()
                }
            }
            launch {
                messageSocketManager.conversationUpdated.collect {
                    repository.refresh()
                }
            }
        }
    }

    /** Selects a filter tab and re-derives the visible list from the cached conversations (no network). */
    fun selectFilter(filter: ConversationFilter) {
        _state.update { it.copy(selectedFilter = filter).withVisible(rawConversations) }
    }

    /** Updates the free-text search query and re-derives the visible list (no network). */
    fun setSearch(query: String) {
        _state.update { it.copy(searchText = query).withVisible(rawConversations) }
    }

    /** Opens or closes the search field; closing clears the query and restores the full list. */
    fun setSearchActive(active: Boolean) {
        _state.update {
            val next = if (active) it else it.copy(searchText = "")
            next.copy(isSearchActive = active).withVisible(rawConversations)
        }
    }

    /** Pull-to-refresh: the visible spinner tracks the user gesture only —
     * background SWR revalidations stay silent ([ConversationListUiState.isSyncing]). */
    fun refresh() {
        _state.update { it.copy(errorMessage = null, isSyncing = true, isUserRefreshing = true) }
        viewModelScope.launch {
            try {
                repository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update {
                    it.copy(errorMessage = e.message, showSkeleton = false)
                }
            } finally {
                _state.update { it.copy(isUserRefreshing = false, isSyncing = false) }
            }
        }
    }
}

/** Extracts the list carried by a [CacheResult], keeping [fallback] when a sync carries no value yet. */
private fun CacheResult<List<ApiConversation>>.rawListOr(
    fallback: List<ApiConversation>,
): List<ApiConversation> = when (this) {
    is CacheResult.Fresh -> value
    is CacheResult.Stale -> value
    is CacheResult.Syncing -> value ?: fallback
    CacheResult.Empty -> emptyList()
}

/**
 * Re-derives the visible (filtered + searched) list from the authoritative [raw]
 * cache list, applying the active filter, search query and current user identity.
 */
private fun ConversationListUiState.withVisible(raw: List<ApiConversation>): ConversationListUiState =
    copy(conversations = ConversationFilters.apply(raw, selectedFilter, searchText, currentUserId))

/**
 * Maps a [CacheResult]'s SWR flags onto the screen state — skeleton only on a
 * cold, error-free empty cache. The visible list is computed separately by
 * [withVisible] so an active filter never triggers the cold-start skeleton.
 */
private fun ConversationListUiState.applyResultFlags(
    result: CacheResult<List<ApiConversation>>,
    raw: List<ApiConversation>,
): ConversationListUiState = when (result) {
    is CacheResult.Fresh -> copy(isSyncing = false, showSkeleton = false, errorMessage = null)
    is CacheResult.Stale -> copy(isSyncing = true, showSkeleton = false)
    is CacheResult.Syncing -> copy(
        isSyncing = true,
        showSkeleton = result.value == null && raw.isEmpty() && errorMessage == null,
    )
    CacheResult.Empty -> copy(isSyncing = false, showSkeleton = errorMessage == null)
}
