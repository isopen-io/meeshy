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
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusBarCacheRepository
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.status.StatusRepository
import me.meeshy.sdk.status.orderedForBar
import me.meeshy.sdk.status.toStatusEntry
import javax.inject.Inject

/**
 * The mood-statuses bar — port of iOS `StatusViewModel`. Loads the `friends` (or
 * `discover`) status feed cursor-page by cursor-page through [StatusRepository],
 * projects the accumulation through the `orderedForBar` SSOT (own status first,
 * deduped), and publishes/clears/reacts optimistically with rollback on failure.
 *
 * The list is the pure [StatusBarListState]; this ViewModel is the orchestration
 * layer (when to fetch, when to roll back, which mode). A warm re-entry (or a switch
 * back to an already-loaded feed) is served instantly from the in-memory
 * [StatusBarCache] L1 tier before any network call, revalidating in the background
 * unless the snapshot is still fresh (instant-app parity with iOS's
 * `CacheCoordinator.statuses`). A **cold launch** (L1 empty after a process death) is
 * seeded from the Room-backed [StatusBarCacheRepository] L2 tier before the first
 * network call, then reconciled — every network page and optimistic mutation is
 * written through to both tiers so the next cold launch paints instantly.
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
    private val statusBarCache: StatusBarCache,
    private val statusBarCacheRepository: StatusBarCacheRepository,
    private val socialSocket: SocialSocketManager,
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
        subscribeToSocketEvents()
        loadInitial()
    }

    /**
     * Fold realtime social-socket deltas into the live bar — parity with iOS
     * `StatusViewModel.subscribeToSocketEvents`. A `status:created` from a friend is
     * hoisted to the front (de-duplicated by id, so the viewer's own echo — the gateway
     * emits no client mutation id for statuses — is inert since [setStatus] already
     * inserted it); a `status:updated` replaces the entry in place; a `status:deleted`
     * drops it; a `status:reacted` bumps the reaction count and a `status:unreacted`
     * decrements it (clamped, spent bucket dropped) — both **skipping the acting user's
     * own echo** ([react] already applied it optimistically). A payload that does not
     * map to a mood status (a non-`STATUS` post) is ignored. Deltas fold straight into
     * [listState]; the next network [fetchFirstPage] reconciles the authoritative page.
     */
    private fun subscribeToSocketEvents() {
        viewModelScope.launch {
            socialSocket.statusCreated.collect { payload ->
                val entry = payload.status.toStatusEntry() ?: return@collect
                if (listState.value.statuses.none { it.id == entry.id }) {
                    listState.update { it.created(entry) }
                }
            }
        }
        viewModelScope.launch {
            socialSocket.statusUpdated.collect { payload ->
                val entry = payload.status.toStatusEntry() ?: return@collect
                listState.update { it.updated(entry) }
            }
        }
        viewModelScope.launch {
            socialSocket.statusDeleted.collect { payload ->
                listState.update { it.removed(payload.statusId) }
            }
        }
        viewModelScope.launch {
            socialSocket.statusReacted.collect { payload ->
                if (payload.userId != currentUserId()) {
                    listState.update { it.reacted(payload.statusId, payload.emoji) }
                }
            }
        }
        viewModelScope.launch {
            socialSocket.statusUnreacted.collect { payload ->
                if (payload.userId != currentUserId()) {
                    listState.update { it.unreacted(payload.statusId, payload.emoji) }
                }
            }
        }
    }

    /**
     * The signed-in user's id, or null for an anonymous session — used to drop the
     * viewer's own `status:reacted` echo (already applied optimistically by [react]).
     * Mirrors the iOS `payload.userId != currentUser?.id` guard.
     */
    private fun currentUserId(): String? = sessionRepository.currentUser.value?.id

    /**
     * First page. Guarded so a re-entrant call (e.g. an `onAppear` re-fire) while a
     * load is in flight or after the list has already loaded is a no-op — [refresh]
     * is the way to force a reload. Cache-first: a warm [StatusBarCache] snapshot paints
     * the bar instantly before any network call.
     */
    fun loadInitial() {
        if (status.value.isLoading || listState.value.hasLoaded) return
        loadFromCacheThenNetwork(mode.value)
    }

    /**
     * Switch feed ([StatusFeedMode.FRIENDS] ↔ [StatusFeedMode.DISCOVER]): serve the new
     * feed's cached bar instantly if present, then revalidate; a cold feed shows the
     * skeleton and fetches. A no-op when already on [newMode], so re-selecting the active
     * tab never re-fetches. Mirrors iOS's per-mode `StatusViewModel` instance (each with
     * its own `statuses_<mode>` cache) — one Android VM drives both bars.
     */
    fun setMode(newMode: StatusFeedMode) {
        if (mode.value == newMode) return
        mode.value = newMode
        loadFromCacheThenNetwork(newMode)
    }

    /**
     * Cache-first cold paint for [targetMode] (ARCHITECTURE.md §4). Seeds the bar from
     * the L1 snapshot so a warm re-entry (or a switch to an already-loaded feed) paints
     * instantly with no skeleton, then revalidates in the background unless the snapshot
     * is still [CacheResult.Fresh]. An expired ([CacheResult.Syncing]) snapshot is still
     * served while it revalidates — the stale-while-revalidate improvement over iOS,
     * which discards expired data. A cold ([CacheResult.Empty]) feed — the L1 memory tier
     * is empty after a process death — is seeded from the Room-backed L2 disk cache before
     * the first network call (cold-launch instant paint) and falls back to the skeleton only
     * when the disk is cold too. Mirrors iOS `loadStatuses`' switch over the cache result.
     */
    private fun loadFromCacheThenNetwork(targetMode: StatusFeedMode) {
        when (val cached = statusBarCache.load(targetMode)) {
            is CacheResult.Fresh -> {
                listState.value = StatusBarListState().seeded(cached.value)
                status.update { it.copy(isLoading = false, isRefreshing = false, error = null) }
            }
            is CacheResult.Stale -> {
                listState.value = StatusBarListState().seeded(cached.value)
                status.update { it.copy(isLoading = true, isRefreshing = false, error = null) }
                fetchFirstPage()
            }
            is CacheResult.Syncing -> {
                listState.value = cached.value
                    ?.let { StatusBarListState().seeded(it) }
                    ?: StatusBarListState()
                status.update { it.copy(isLoading = true, isRefreshing = false, error = null) }
                fetchFirstPage()
            }
            CacheResult.Empty -> {
                listState.value = StatusBarListState()
                status.update { it.copy(isLoading = true, isRefreshing = false, error = null) }
                fetchFirstPage(disk = DiskCachePlan.SEED)
            }
        }
    }

    /**
     * Pull-to-refresh: invalidate the cached bar, reset the accumulation to a cold list
     * and re-fetch the first page (bypassing the cache). Mirrors iOS `refresh()`
     * (invalidate + reload). Both cache tiers are invalidated — the L1 snapshot here and
     * the L2 disk row inside [fetchFirstPage] — and the fresh page is written back through
     * both on success.
     */
    fun refresh() {
        statusBarCache.invalidate(mode.value)
        listState.value = StatusBarListState()
        status.update { it.copy(isRefreshing = true, error = null) }
        fetchFirstPage(disk = DiskCachePlan.INVALIDATE)
    }

    /**
     * Fetch the first page for the active mode, running [disk] against the L2 tier first:
     * [DiskCachePlan.SEED] paints the last-persisted bar instantly on a cold launch (only
     * while the list is still cold and the mode has not switched underneath the read),
     * [DiskCachePlan.INVALIDATE] drops the stale disk row before a refresh. On success the
     * authoritative page replaces the list and is written through to both cache tiers.
     */
    private fun fetchFirstPage(disk: DiskCachePlan = DiskCachePlan.NONE) {
        val activeMode = mode.value
        viewModelScope.launch {
            try {
                when (disk) {
                    DiskCachePlan.SEED -> {
                        val seed = statusBarCacheRepository.cachedBar(activeMode)
                        if (seed != null && activeMode == mode.value && !listState.value.hasLoaded) {
                            listState.value = StatusBarListState().seeded(seed)
                            statusBarCache.save(activeMode, seed)
                        }
                    }
                    DiskCachePlan.INVALIDATE -> statusBarCacheRepository.invalidate(activeMode)
                    DiskCachePlan.NONE -> Unit
                }
                when (val result = statusRepository.list(mode = activeMode, cursor = null)) {
                    is NetworkResult.Success -> {
                        listState.value = StatusBarListState().appended(result.data)
                        statusBarCache.save(activeMode, result.data.statuses)
                        statusBarCacheRepository.persistBar(activeMode, result.data.statuses)
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
        viaUsername: String? = null,
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
                    viaUsername = viaUsername,
                )
                when (result) {
                    is NetworkResult.Success -> {
                        listState.update { it.created(result.data) }
                        statusBarCache.save(mode.value, listState.value.statuses)
                        statusBarCacheRepository.persistBar(mode.value, listState.value.statuses)
                    }
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
                } else {
                    statusBarCache.save(mode.value, listState.value.statuses)
                    statusBarCacheRepository.persistBar(mode.value, listState.value.statuses)
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

    /** How the first-page fetch should touch the L2 disk tier before/around the network. */
    private enum class DiskCachePlan { NONE, SEED, INVALIDATE }

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
