package me.meeshy.app.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.friend.BlockedListRepository
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import javax.inject.Inject

data class BlockedListUiState(
    val blocked: List<BlockedUser> = emptyList(),
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val errorMessage: String? = null,
    /** Ids with an unblock in flight — guards the button + double-taps. */
    val pendingIds: Set<String> = emptySet(),
) {
    /** Skeleton only on a cold empty load (never over an already-painted list). */
    val showSkeleton: Boolean get() = isLoading && blocked.isEmpty()

    /** A settled, error-free load with nobody blocked → the empty state. */
    val isEmpty: Boolean get() = hasLoaded && blocked.isEmpty() && errorMessage == null
}

/**
 * The Blocked tab — the blocklist with confirm-to-unblock. Port of the iOS
 * `BlockedViewModel`. [load] first paints the last-persisted blocklist from
 * the Room-backed [BlockedListRepository] for an instant cold-start view (the
 * Android analogue of iOS `CacheCoordinator`, mirroring
 * [ContactsListViewModel]'s [me.meeshy.sdk.friend.FriendListRepository]
 * pattern), then revalidates silently via [BlockRepository] (which hydrates
 * the shared [me.meeshy.sdk.friend.BlockCache], so unblocking here flips the
 * resolver's block state everywhere) and writes the authoritative roster back
 * through to the cache. Unblocking is optimistic: the row leaves the list
 * immediately (written through so a cold relaunch never resurrects it) and the
 * change is delivered **durably** through the outbox — it survives offline +
 * process death, and a hard-exhausted delivery rolls the shared block state
 * back so the next load re-hydrates truthfully. Only a local enqueue failure
 * rolls the row (and the cache) back into place.
 */
@HiltViewModel
class BlockedListViewModel @Inject constructor(
    private val blockRepository: BlockRepository,
    private val blockedListRepository: BlockedListRepository,
    private val workManager: WorkManager,
) : ViewModel() {

    private val _state = MutableStateFlow(BlockedListUiState())
    val state: StateFlow<BlockedListUiState> = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            paintFromCache()
            revalidate()
        }
    }

    /**
     * Cache-first cold paint (ARCHITECTURE.md §4): if nothing is on screen yet,
     * replay the last-persisted blocklist from Room so the tab shows blocked
     * users instantly — no blocking spinner when the cache has data. A `null`
     * snapshot is a cold cache (never synced) → keep the skeleton until the
     * network answers; a synced-but-empty snapshot settles with no skeleton.
     */
    private suspend fun paintFromCache() {
        if (_state.value.blocked.isNotEmpty()) return
        val cached = blockedListRepository.cachedSnapshot()
        _state.update {
            if (cached == null) it.copy(isLoading = true, errorMessage = null)
            else it.copy(blocked = cached, isLoading = false, hasLoaded = true, errorMessage = null)
        }
    }

    private suspend fun revalidate() {
        when (val result = blockRepository.listBlocked()) {
            is NetworkResult.Success -> {
                _state.update {
                    it.copy(
                        blocked = result.data,
                        isLoading = false,
                        hasLoaded = true,
                        errorMessage = null,
                    )
                }
                blockedListRepository.persist(result.data)
            }
            is NetworkResult.Failure ->
                _state.update {
                    it.copy(
                        isLoading = false,
                        hasLoaded = true,
                        errorMessage = if (it.blocked.isEmpty()) result.error.message else it.errorMessage,
                    )
                }
        }
    }

    fun unblock(userId: String) {
        if (userId in _state.value.pendingIds) return
        val snapshot = _state.value.blocked
        if (snapshot.none { it.id == userId }) return
        val updated = snapshot.filterNot { it.id == userId }
        _state.update { it.copy(blocked = updated, pendingIds = it.pendingIds + userId) }
        viewModelScope.launch { blockedListRepository.persist(updated) }
        viewModelScope.launch {
            try {
                val cmid = blockRepository.setBlockedDurably(userId, blocked = false)
                if (cmid != null) workManager.enqueue(OutboxFlushWorker.buildRequest())
                _state.update { it.copy(pendingIds = it.pendingIds - userId) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The local enqueue failed — restore the row (and the cache) so the user can retry.
                _state.update {
                    it.copy(
                        blocked = snapshot,
                        pendingIds = it.pendingIds - userId,
                        errorMessage = e.message,
                    )
                }
                blockedListRepository.persist(snapshot)
            }
        }
    }

    fun dismissError() = _state.update { it.copy(errorMessage = null) }
}
