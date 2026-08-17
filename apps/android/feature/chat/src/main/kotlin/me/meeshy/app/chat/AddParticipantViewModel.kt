package me.meeshy.app.chat

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
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/** One search result row, projected for the add-participant list. */
data class AddParticipantRow(
    val id: String,
    val name: String,
    val username: String,
    val avatarUrl: String?,
    val isOnline: Boolean?,
    val isMember: Boolean,
    val isAdding: Boolean,
)

data class AddParticipantUiState(
    val query: String = "",
    val results: List<AddParticipantRow> = emptyList(),
    val isSearching: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * Drives the "add a member" search sheet nested inside [ConversationMembersSheet] — the
 * Android port of iOS `AddParticipantSheet`. Debounced search mirrors
 * [me.meeshy.app.conversations.NewConversationViewModel] exactly (300 ms, 2-char floor);
 * unlike that picker there is no multi-select — each row adds immediately, one request
 * per tap.
 */
@OptIn(FlowPreview::class)
@HiltViewModel
class AddParticipantViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val conversationRepository: ConversationRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AddParticipantUiState())
    val state: StateFlow<AddParticipantUiState> = _state.asStateFlow()

    private val queryFlow = MutableStateFlow("")
    private var conversationId: String = ""
    private var existingMemberIds: Set<String> = emptySet()
    private var rawResults: List<UserSearchResult> = emptyList()
    private val addedUserIds = mutableSetOf<String>()
    private val addingUserIds = mutableSetOf<String>()

    init {
        viewModelScope.launch {
            queryFlow
                .debounce(SEARCH_DEBOUNCE_MS)
                .distinctUntilChanged()
                .collect { runSearch(it) }
        }
    }

    /** Binds the sheet to [conversationId]/[existingMemberIds] — idempotent, safe on every open. */
    fun load(conversationId: String, existingMemberIds: Set<String>) {
        this.conversationId = conversationId
        this.existingMemberIds = existingMemberIds
        _state.update { it.copy(results = projectedRows()) }
    }

    fun onQueryChange(value: String) {
        _state.update { it.copy(query = value, errorMessage = null) }
        queryFlow.value = value
    }

    /**
     * Adds [userId], calling [onAdded] once the server confirms — the caller uses it to
     * refresh the members sheet behind this one, mirroring iOS's `onAdded` callback. A
     * repeat tap while the same user's request is already in flight is a no-op; a refusal
     * rolls the row back to offering the button again and surfaces the server's message.
     */
    fun addParticipant(userId: String, onAdded: () -> Unit) {
        if (userId in addingUserIds || userId in addedUserIds) return
        addingUserIds += userId
        _state.update { it.copy(results = projectedRows(), errorMessage = null) }
        viewModelScope.launch {
            try {
                when (val result = conversationRepository.addParticipant(conversationId, userId)) {
                    is NetworkResult.Success -> {
                        addingUserIds -= userId
                        addedUserIds += userId
                        _state.update { it.copy(results = projectedRows()) }
                        onAdded()
                    }
                    is NetworkResult.Failure -> {
                        addingUserIds -= userId
                        _state.update { it.copy(results = projectedRows(), errorMessage = result.error.message) }
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                addingUserIds -= userId
                _state.update { it.copy(results = projectedRows(), errorMessage = e.message) }
            }
        }
    }

    private suspend fun runSearch(query: String) {
        val trimmed = query.trim()
        if (trimmed.length < MIN_QUERY_LENGTH) {
            rawResults = emptyList()
            _state.update { it.copy(results = emptyList(), isSearching = false) }
            return
        }
        _state.update { it.copy(isSearching = true) }
        try {
            when (val result = userRepository.searchUsers(trimmed)) {
                is NetworkResult.Success -> {
                    rawResults = result.data
                    _state.update { it.copy(results = projectedRows(), isSearching = false) }
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

    private fun projectedRows(): List<AddParticipantRow> = rawResults.map { user ->
        AddParticipantRow(
            id = user.id,
            name = user.displayName?.takeIf { it.isNotBlank() } ?: user.username,
            username = user.username,
            avatarUrl = user.avatar,
            isOnline = user.isOnline,
            isMember = user.id in existingMemberIds || user.id in addedUserIds,
            isAdding = user.id in addingUserIds,
        )
    }

    private companion object {
        const val SEARCH_DEBOUNCE_MS = 300L
        const val MIN_QUERY_LENGTH = 2
    }
}
