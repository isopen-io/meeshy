package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

data class ConversationListUiState(
    val isLoading: Boolean = false,
    val conversations: List<ApiConversation> = emptyList(),
    val errorMessage: String? = null,
) {
    /** Cache-First: a skeleton shows only on a cold, empty list. */
    val showSkeleton: Boolean get() = isLoading && conversations.isEmpty()
}

@HiltViewModel
class ConversationListViewModel @Inject constructor(
    private val repository: ConversationRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationListUiState())
    val state: StateFlow<ConversationListUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            val result = repository.list()
            _state.update {
                when (result) {
                    is NetworkResult.Success -> it.copy(isLoading = false, conversations = result.data)
                    is NetworkResult.Failure -> it.copy(isLoading = false, errorMessage = result.error.message)
                }
            }
        }
    }
}
