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
    val query: String = "",
    val isSyncing: Boolean = false,
    val isRefreshing: Boolean = false,
    val isConnected: Boolean = true,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
) {
    val filteredConversations: List<ApiConversation>
        get() {
            val needle = query.trim().normalized()
            if (needle.isEmpty()) return conversations
            return conversations.filter { conversation ->
                listOfNotNull(
                    conversation.title,
                    conversation.preferences?.customName,
                    conversation.identifier,
                ).any { it.normalized().contains(needle) }
            }
        }
}

private fun String.normalized(): String =
    java.text.Normalizer.normalize(lowercase(), java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")

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
            var everConnected = false
            var previous: Boolean? = null
            messageSocketManager.connectionState.collect { connected ->
                if (connected) everConnected = true
                _state.update { it.copy(isConnected = connected || !everConnected) }
                if (connected && previous == false) refreshSilently()
                previous = connected
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

    fun onQueryChange(value: String) {
        _state.update { it.copy(query = value) }
    }

    fun refresh() {
        _state.update { it.copy(errorMessage = null, isSyncing = true, isRefreshing = true) }
        viewModelScope.launch {
            try {
                repository.refresh()
                _state.update { it.copy(isRefreshing = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        errorMessage = e.message,
                        isSyncing = false,
                        isRefreshing = false,
                        showSkeleton = false,
                    )
                }
            }
        }
    }

    private suspend fun refreshSilently() {
        try {
            repository.refresh()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
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
