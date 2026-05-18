package me.meeshy.app.chat

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleContentBuilder
import javax.inject.Inject

data class ChatUiState(
    val messages: List<BubbleContent> = emptyList(),
    val draft: String = "",
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
) {
    val canSend: Boolean get() = draft.isNotBlank()
}

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val conversationId: String = checkNotNull(savedStateHandle[CONVERSATION_ID_ARG]) {
        "ChatViewModel requires a '$CONVERSATION_ID_ARG' navigation argument"
    }

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(
                messageRepository.messagesStream(
                    conversationId,
                    onSyncError = { error ->
                        _state.update {
                            it.copy(errorMessage = error.message, showSkeleton = false, isSyncing = false)
                        }
                    },
                ),
                sessionRepository.currentUser,
            ) { result, user -> result to user }
                .collect { (result, user) ->
                    _state.update { it.applyResult(result, user) }
                }
        }
    }

    fun onDraftChange(value: String) {
        _state.update { it.copy(draft = value) }
    }

    fun send() {
        val text = _state.value.draft.trim()
        if (text.isEmpty()) return
        _state.update { it.copy(draft = "") }
        val language = sessionRepository.currentUser.value?.systemLanguage
            ?: LanguageResolver.FALLBACK_LANGUAGE
        viewModelScope.launch {
            try {
                messageRepository.send(conversationId, text, originalLanguage = language)
                messageRepository.refresh(conversationId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    fun refresh() {
        _state.update { it.copy(errorMessage = null, isSyncing = true) }
        viewModelScope.launch {
            try {
                messageRepository.refresh(conversationId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update {
                    it.copy(errorMessage = e.message, isSyncing = false, showSkeleton = false)
                }
            }
        }
    }

    companion object {
        const val CONVERSATION_ID_ARG: String = "conversationId"
    }
}

private fun ChatUiState.applyResult(
    result: CacheResult<List<ApiMessage>>,
    currentUser: MeeshyUser?,
): ChatUiState = when (result) {
    is CacheResult.Fresh -> copy(
        messages = result.value.toBubbles(currentUser),
        isSyncing = false,
        showSkeleton = false,
        errorMessage = null,
    )
    is CacheResult.Stale -> copy(
        messages = result.value.toBubbles(currentUser),
        isSyncing = true,
        showSkeleton = false,
    )
    is CacheResult.Syncing -> copy(
        messages = result.value?.toBubbles(currentUser) ?: messages,
        isSyncing = true,
        showSkeleton = result.value == null && messages.isEmpty() && errorMessage == null,
    )
    CacheResult.Empty -> copy(
        messages = emptyList(),
        isSyncing = false,
        showSkeleton = errorMessage == null,
    )
}

private fun List<ApiMessage>.toBubbles(currentUser: MeeshyUser?): List<BubbleContent> = map { message ->
    BubbleContentBuilder.build(
        message = message,
        currentUserId = currentUser?.id,
        preferences = currentUser ?: EmptyContentPreferences,
        showSenderName = true,
    )
}

/** Used only before the session loads — yields the fallback language. */
private object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String? = null
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}
