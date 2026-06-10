package me.meeshy.app.chat

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleContentBuilder
import javax.inject.Inject

data class ChatUiState(
    val messages: List<BubbleContent> = emptyList(),
    val draft: String = "",
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
    val typingUsers: List<String> = emptyList(),
    val conversationTitle: String? = null,
) {
    val canSend: Boolean get() = draft.isNotBlank()
}

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    private val messageSocketManager: MessageSocketManager,
    private val workManager: WorkManager,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val conversationId: String = checkNotNull(savedStateHandle[CONVERSATION_ID_ARG]) {
        "ChatViewModel requires a '$CONVERSATION_ID_ARG' navigation argument"
    }

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    private val typingCleanupJobs = mutableMapOf<String, Job>()

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

        viewModelScope.launch {
            launch {
                messageSocketManager.messageReceived.collect { event ->
                    if (event.conversationId == conversationId) {
                        messageRepository.refresh(conversationId)
                    }
                }
            }
            launch {
                messageSocketManager.messageDeleted.collect { event ->
                    if (event.conversationId == conversationId) {
                        messageRepository.refresh(conversationId)
                    }
                }
            }
            launch {
                messageSocketManager.messageUpdated.collect { event ->
                    if (event.conversationId == conversationId) {
                        messageRepository.refresh(conversationId)
                    }
                }
            }
        }

        viewModelScope.launch {
            launch {
                messageSocketManager.typingStarted.collect { event ->
                    if (event.conversationId == conversationId) {
                        val name = event.displayName ?: event.username ?: event.userId
                        typingCleanupJobs[event.userId]?.cancel()
                        _state.update { s ->
                            s.copy(typingUsers = (s.typingUsers - name) + name)
                        }
                        typingCleanupJobs[event.userId] = viewModelScope.launch {
                            delay(TYPING_TIMEOUT_MS)
                            removeTypingUser(event.userId, event.displayName ?: event.username ?: event.userId)
                        }
                    }
                }
            }
            launch {
                messageSocketManager.typingStopped.collect { event ->
                    if (event.conversationId == conversationId) {
                        typingCleanupJobs.remove(event.userId)?.cancel()
                        removeTypingUser(event.userId, event.displayName ?: event.username ?: event.userId)
                    }
                }
            }
        }
    }

    private fun removeTypingUser(userId: String, displayName: String) {
        _state.update { s -> s.copy(typingUsers = s.typingUsers - displayName) }
    }

    fun onDraftChange(value: String) {
        _state.update { it.copy(draft = value) }
    }

    fun send() {
        val text = _state.value.draft.trim()
        if (text.isEmpty()) return
        val user = sessionRepository.currentUser.value ?: return
        _state.update { it.copy(draft = "") }
        viewModelScope.launch {
            try {
                messageRepository.sendOptimistic(
                    conversationId = conversationId,
                    content = text,
                    originalLanguage = user.systemLanguage ?: LanguageResolver.FALLBACK_LANGUAGE,
                    sender = user,
                )
                workManager.enqueue(OutboxFlushWorker.buildRequest())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    fun retryMessage(messageId: String) {
        viewModelScope.launch {
            try {
                messageRepository.retrySend(messageId)
                workManager.enqueue(OutboxFlushWorker.buildRequest())
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
        private const val TYPING_TIMEOUT_MS = 5_000L
    }
}

private fun ChatUiState.applyResult(
    result: CacheResult<List<LocalMessage>>,
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

private fun List<LocalMessage>.toBubbles(currentUser: MeeshyUser?): List<BubbleContent> = map { local ->
    BubbleContentBuilder.build(
        message = local.message,
        currentUserId = currentUser?.id,
        preferences = currentUser ?: EmptyContentPreferences,
        showSenderName = true,
        isPending = local.sendState == LocalSendState.SENDING,
        isFailed = local.sendState == LocalSendState.FAILED,
    )
}

private object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String? = null
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}
