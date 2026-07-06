package me.meeshy.app.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.NetworkResult
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
 * `BlockedViewModel`. Loads via [BlockRepository] (which hydrates the shared
 * [me.meeshy.sdk.friend.BlockCache], so unblocking here flips the resolver's
 * block state everywhere), and unblocks optimistically: the row leaves the list
 * immediately and is restored on network failure.
 */
@HiltViewModel
class BlockedListViewModel @Inject constructor(
    private val blockRepository: BlockRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(BlockedListUiState())
    val state: StateFlow<BlockedListUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = blockRepository.listBlocked()) {
                is NetworkResult.Success ->
                    _state.update {
                        it.copy(
                            blocked = result.data,
                            isLoading = false,
                            hasLoaded = true,
                            errorMessage = null,
                        )
                    }
                is NetworkResult.Failure ->
                    _state.update {
                        it.copy(isLoading = false, hasLoaded = true, errorMessage = result.error.message)
                    }
            }
        }
    }

    fun unblock(userId: String) {
        if (userId in _state.value.pendingIds) return
        val snapshot = _state.value.blocked
        if (snapshot.none { it.id == userId }) return
        _state.update {
            it.copy(
                blocked = it.blocked.filterNot { user -> user.id == userId },
                pendingIds = it.pendingIds + userId,
            )
        }
        viewModelScope.launch {
            when (val result = blockRepository.unblock(userId)) {
                is NetworkResult.Success ->
                    _state.update { it.copy(pendingIds = it.pendingIds - userId) }
                is NetworkResult.Failure ->
                    _state.update {
                        it.copy(
                            blocked = snapshot,
                            pendingIds = it.pendingIds - userId,
                            errorMessage = result.error.message,
                        )
                    }
            }
        }
    }

    fun dismissError() = _state.update { it.copy(errorMessage = null) }
}
