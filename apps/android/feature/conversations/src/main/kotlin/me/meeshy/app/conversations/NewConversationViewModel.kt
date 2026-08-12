package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

data class NewConversationUiState(
    val query: String = "",
    val results: List<SelectableUser> = emptyList(),
    val selected: List<SelectableUser> = emptyList(),
    val groupTitle: String = "",
    val isSearching: Boolean = false,
    val isCreating: Boolean = false,
    val errorMessage: String? = null,
    val createdConversationId: String? = null,
) {
    val isGroup: Boolean get() = selected.size >= 2
    val canCreate: Boolean
        get() = NewConversationLogic.canCreate(selected.size) && !isCreating
}

/**
 * Drives the "new conversation" picker (port of iOS `NewConversationView`):
 * debounced user search, multi-select with persistent chips, and direct/group
 * creation. Selected users survive query changes because they live in their own
 * map, independent of the latest search results.
 */
@OptIn(FlowPreview::class)
@HiltViewModel
class NewConversationViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val conversationRepository: ConversationRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(NewConversationUiState())
    val state: StateFlow<NewConversationUiState> = _state.asStateFlow()

    private val queryFlow = MutableStateFlow("")
    private val selectedById = LinkedHashMap<String, SelectableUser>()

    init {
        viewModelScope.launch {
            queryFlow
                .debounce(SEARCH_DEBOUNCE_MS)
                .distinctUntilChanged()
                .collect { runSearch(it) }
        }
    }

    fun onQueryChange(value: String) {
        _state.update { it.copy(query = value, errorMessage = null) }
        queryFlow.value = value
    }

    fun onGroupTitleChange(value: String) {
        _state.update { it.copy(groupTitle = value) }
    }

    fun toggleSelection(userId: String) {
        val existing = selectedById.remove(userId)
        if (existing == null) {
            val row = _state.value.results.firstOrNull { it.id == userId } ?: return
            selectedById[userId] = row.copy(isSelected = true)
        }
        publishSelection()
    }

    fun create() {
        val current = _state.value
        if (!current.canCreate) return
        val participants = selectedById.keys.toList()
        val type = NewConversationLogic.conversationType(participants.size)
        val title = NewConversationLogic.resolvedTitle(current.groupTitle, participants.size)
        _state.update { it.copy(isCreating = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                when (val result = conversationRepository.create(type, title, participants)) {
                    is NetworkResult.Success ->
                        _state.update { it.copy(isCreating = false, createdConversationId = result.data.id) }
                    is NetworkResult.Failure ->
                        _state.update { it.copy(isCreating = false, errorMessage = result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isCreating = false, errorMessage = e.message) }
            }
        }
    }

    fun consumeCreated() {
        _state.update { it.copy(createdConversationId = null) }
    }

    private suspend fun runSearch(query: String) {
        val trimmed = query.trim()
        if (trimmed.length < MIN_QUERY_LENGTH) {
            _state.update { it.copy(results = projectedRows(emptyList()), isSearching = false) }
            return
        }
        _state.update { it.copy(isSearching = true) }
        try {
            when (val result = userRepository.searchUsers(trimmed)) {
                is NetworkResult.Success ->
                    _state.update {
                        it.copy(results = projectedRows(result.data), isSearching = false)
                    }
                is NetworkResult.Failure ->
                    _state.update { it.copy(isSearching = false, errorMessage = result.error.message) }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _state.update { it.copy(isSearching = false, errorMessage = e.message) }
        }
    }

    private fun projectedRows(results: List<me.meeshy.sdk.net.api.UserSearchResult>) =
        NewConversationLogic.rows(results, selectedById.keys.toSet())

    private fun publishSelection() {
        val selectedIds = selectedById.keys.toSet()
        _state.update { current ->
            current.copy(
                selected = selectedById.values.toList(),
                results = current.results.map { it.copy(isSelected = it.id in selectedIds) },
            )
        }
    }

    companion object {
        private const val SEARCH_DEBOUNCE_MS = 300L
        private const val MIN_QUERY_LENGTH = 2
    }
}
