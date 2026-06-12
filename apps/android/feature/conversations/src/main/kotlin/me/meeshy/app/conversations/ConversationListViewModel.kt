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
import me.meeshy.sdk.socket.MessageSocketManager
import javax.inject.Inject

data class ConversationListUiState(
    val conversations: List<ApiConversation> = emptyList(),
    val isSyncing: Boolean = false,
    val isUserRefreshing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class ConversationListViewModel @Inject constructor(
    private val repository: ConversationRepository,
    private val messageSocketManager: MessageSocketManager,
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
