package me.meeshy.app.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.status.StatusRepository
import me.meeshy.sdk.status.orderedForBar
import javax.inject.Inject

/**
 * The mood-statuses bar — port of iOS `StatusViewModel`. Loads the `friends` (or
 * `discover`) status feed cursor-page by cursor-page through [StatusRepository],
 * projects the accumulation through the `orderedForBar` SSOT (own status first,
 * deduped), and publishes/clears/reacts optimistically with rollback on failure.
 *
 * The list is the pure [StatusBarListState]; this ViewModel is the orchestration
 * layer (when to fetch, when to roll back, which mode). There is no repository-level
 * status cache yet, so a cold open shows a skeleton then the first page — a follow-up
 * will add an L1 cache to serve the bar instantly (instant-app parity with iOS's
 * `CacheCoordinator.statuses`, tracked in feature-parity §G).
 */
data class StatusesUiState(
    val statuses: List<StatusEntry> = emptyList(),
    val myStatus: StatusEntry? = null,
    val mode: StatusFeedMode = StatusFeedMode.FRIENDS,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val showSkeleton: Boolean = false,
    val hasMore: Boolean = true,
    val errorMessage: String? = null,
)

@HiltViewModel
class StatusesViewModel @Inject constructor(
    private val statusRepository: StatusRepository,
    private val sessionRepository: SessionRepository,
) : ViewModel() {

    private val mode = MutableStateFlow(StatusFeedMode.FRIENDS)
    private val listState = MutableStateFlow(StatusBarListState())
    private val status = MutableStateFlow(StatusesStatus())

    private val _state = MutableStateFlow(StatusesUiState())
    val state: StateFlow<StatusesUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(
                listState,
                sessionRepository.currentUser,
                status,
                mode,
            ) { list, user, st, m ->
                project(list, user, st, m)
            }.collect { projected -> _state.value = projected }
        }
        loadInitial()
    }

    /**
     * First page. Guarded so a re-entrant call (e.g. an `onAppear` re-fire) while a
     * load is in flight or after the list has already loaded is a no-op — [refresh]
     * is the way to force a reload.
     */
    fun loadInitial() {
        if (status.value.isLoading || listState.value.hasLoaded) return
        status.update { it.copy(isLoading = true, error = null) }
        fetchFirstPage()
    }

    /**
     * Switch feed ([StatusFeedMode.FRIENDS] ↔ [StatusFeedMode.DISCOVER]): reset the
     * accumulation to cold and load the new feed's first page. A no-op when already
     * on [newMode], so re-selecting the active tab never re-fetches. Mirrors iOS's
     * per-mode `StatusViewModel` instance — one Android VM drives both bars.
     */
    fun setMode(newMode: StatusFeedMode) {
        if (mode.value == newMode) return
        mode.value = newMode
        listState.value = StatusBarListState()
        status.update { it.copy(isLoading = true, isRefreshing = false, error = null) }
        fetchFirstPage()
    }

    /**
     * Pull-to-refresh: reset the accumulation to a cold list and re-fetch the first
     * page. Mirrors iOS `refresh()` (invalidate + reload).
     */
    fun refresh() {
        listState.value = StatusBarListState()
        status.update { it.copy(isRefreshing = true, error = null) }
        fetchFirstPage()
    }

    private fun fetchFirstPage() {
        val activeMode = mode.value
        viewModelScope.launch {
            try {
                when (val result = statusRepository.list(mode = activeMode, cursor = null)) {
                    is NetworkResult.Success -> {
                        listState.update { it.appended(result.data) }
                        status.update { it.copy(isLoading = false, isRefreshing = false) }
                    }
                    is NetworkResult.Failure ->
                        status.update {
                            it.copy(isLoading = false, isRefreshing = false, error = result.error.message)
                        }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(isLoading = false, isRefreshing = false, error = e.message) }
            }
        }
    }

    /**
     * Infinite scroll: once the given status is within [LOAD_MORE_THRESHOLD] of the
     * tail and the pure state says a page can still be fetched, load it. Re-entrancy
     * is guarded by [StatusesStatus.isLoadingMore]; a failed page is silent (the next
     * scroll re-triggers), matching iOS.
     */
    fun loadMoreIfNeeded(statusId: String) {
        val current = _state.value
        val index = current.statuses.indexOfFirst { it.id == statusId }
        if (index < 0 || index < current.statuses.size - LOAD_MORE_THRESHOLD) return
        val list = listState.value
        if (!list.canLoadMore || status.value.isLoadingMore) return

        val activeMode = mode.value
        status.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                when (val result = statusRepository.list(mode = activeMode, cursor = list.cursor)) {
                    is NetworkResult.Success -> listState.update { it.appended(result.data) }
                    is NetworkResult.Failure -> Unit
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Silent: the next scroll re-triggers the fetch.
            } finally {
                status.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    /**
     * Publish a mood status: create it, then hoist the mapped entry to the front of
     * the bar. Port of iOS `setStatus` (online path). On failure the list is left
     * untouched and the error surfaces — the create is confirmed by the network
     * before the optimistic insert, so there is nothing to roll back.
     */
    fun setStatus(
        emoji: String,
        content: String? = null,
        visibility: String = "PUBLIC",
        audioUrl: String? = null,
        repostOfId: String? = null,
    ) {
        status.update { it.copy(error = null) }
        viewModelScope.launch {
            try {
                val result = statusRepository.create(
                    moodEmoji = emoji,
                    content = content,
                    visibility = visibility,
                    audioUrl = audioUrl,
                    repostOfId = repostOfId,
                )
                when (result) {
                    is NetworkResult.Success -> listState.update { it.created(result.data) }
                    is NetworkResult.Failure -> status.update { it.copy(error = result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(error = e.message) }
            }
        }
    }

    /**
     * Optimistically clear the signed-in user's own status: drop it instantly, persist
     * the delete, and restore the pre-removal snapshot on failure. Port of iOS
     * `clearStatus`. Inert when the user has no own status in the bar.
     */
    fun clearStatus() {
        val ownId = _state.value.myStatus?.id ?: return
        val snapshot = listState.value
        listState.update { it.removed(ownId) }
        viewModelScope.launch {
            try {
                val result = statusRepository.delete(ownId)
                if (result is NetworkResult.Failure) {
                    listState.value = snapshot
                    status.update { it.copy(error = result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                listState.value = snapshot
                status.update { it.copy(error = e.message) }
            }
        }
    }

    /**
     * Optimistically bump a reaction on [statusId], persist it, and roll the bump back
     * on failure. Port of iOS `reactToStatus`. Inert when the status is not in the bar.
     */
    fun react(statusId: String, emoji: String) {
        val snapshot = listState.value
        if (snapshot.statuses.none { it.id == statusId }) return
        listState.update { it.reacted(statusId, emoji) }
        viewModelScope.launch {
            try {
                val result = statusRepository.react(statusId, emoji)
                if (result is NetworkResult.Failure) {
                    listState.value = snapshot
                    status.update { it.copy(error = result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                listState.value = snapshot
                status.update { it.copy(error = e.message) }
            }
        }
    }

    private fun project(
        list: StatusBarListState,
        user: MeeshyUser?,
        st: StatusesStatus,
        m: StatusFeedMode,
    ): StatusesUiState {
        val ordered = list.statuses.orderedForBar(user?.id)
        val myStatus = if (m == StatusFeedMode.FRIENDS) {
            user?.id?.let { id -> ordered.firstOrNull { it.userId == id } }
        } else {
            null
        }
        val showSkeleton = st.isLoading && !list.hasLoaded && ordered.isEmpty() && st.error == null
        return StatusesUiState(
            statuses = ordered,
            myStatus = myStatus,
            mode = m,
            isLoading = st.isLoading,
            isRefreshing = st.isRefreshing,
            isLoadingMore = st.isLoadingMore,
            showSkeleton = showSkeleton,
            hasMore = list.hasMore,
            errorMessage = st.error,
        )
    }

    private companion object {
        const val LOAD_MORE_THRESHOLD = 3
    }
}

private data class StatusesStatus(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
)
