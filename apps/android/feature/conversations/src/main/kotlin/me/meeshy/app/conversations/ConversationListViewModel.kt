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
import javax.inject.Inject

data class ConversationListUiState(
    val conversations: List<ApiConversation> = emptyList(),
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class ConversationListViewModel @Inject constructor(
    private val repository: ConversationRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationListUiState())
    val state: StateFlow<ConversationListUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.conversationsStream(
                onSyncError = { error ->
                    _state.update {
                        it.copy(errorMessage = error.message, showSkeleton = false, isSyncing = false)
                    }
                },
            ).collect { result ->
                _state.update { it.applyResult(result) }
            }
        }
    }

    fun refresh() {
        _state.update { it.copy(errorMessage = null, isSyncing = true) }
        viewModelScope.launch {
            try {
                repository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update {
                    it.copy(errorMessage = e.message, isSyncing = false, showSkeleton = false)
                }
            }
        }
    }
}

/** Maps a [CacheResult] onto the screen state — skeleton only on a cold, error-free [CacheResult.Empty]. */
private fun ConversationListUiState.applyResult(
    result: CacheResult<List<ApiConversation>>,
): ConversationListUiState = when (result) {
    is CacheResult.Fresh -> copy(
        conversations = result.value,
        isSyncing = false,
        showSkeleton = false,
        errorMessage = null,
    )
    is CacheResult.Stale -> copy(
        conversations = result.value,
        isSyncing = true,
        showSkeleton = false,
    )
    is CacheResult.Syncing -> copy(
        conversations = result.value ?: conversations,
        isSyncing = true,
        showSkeleton = result.value == null && conversations.isEmpty() && errorMessage == null,
    )
    CacheResult.Empty -> copy(
        conversations = emptyList(),
        isSyncing = false,
        showSkeleton = errorMessage == null,
    )
}
