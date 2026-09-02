package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

data class StorySendToUiState(
    val isLoading: Boolean = true,
    val query: String = "",
    val caption: String = "",
    val targets: List<StorySendTarget> = emptyList(),
    val sendingConversationId: String? = null,
    val sentConversationIds: Set<String> = emptySet(),
    val errorMessage: String? = null,
) {
    /** The gateway rejects a `storyReplyToId`-only body — a non-blank caption is required. */
    val canSend: Boolean get() = caption.isNotBlank()
}

/**
 * Drives [StorySendToSheet] — the "Send to…" picker reached from the story
 * viewer's options menu (issue #4816). Sends the OPEN story into one or more
 * conversations as a normal message carrying `storyReplyToId`, exactly the
 * reference `ApiMessage.storyReplyToId` / `ApiPostReplyTarget` already know
 * how to render into a story-reply bubble ([BubbleContentBuilder.buildStoryReply])
 * — this lot is the SEND half of a wire format the RECEIVE half already spoke.
 *
 * Mirrors `ChatViewModel.forwardTo` / `ShareTargetViewModel`: multiple targets
 * may be sent to in the same sheet visit (no auto-close), each independently
 * tracked as sending/sent so a slow network on one target never blocks the
 * others. The conversation list itself reuses the same cache-first,
 * stale-while-revalidate stream every other list surface reads
 * ([ConversationRepository.conversationsStream]).
 */
@HiltViewModel
class StorySendToViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    private val workManager: WorkManager,
) : ViewModel() {

    private val _state = MutableStateFlow(StorySendToUiState())
    val state: StateFlow<StorySendToUiState> = _state.asStateFlow()

    private var storyId: String? = null
    private var allConversations: List<ApiConversation> = emptyList()
    private var loadJob: Job? = null

    /**
     * Binds the story being sent — call once, right after the sheet opens.
     * Idempotent for an unchanged [storyId] (the ViewModel can outlive the
     * sheet's own composable when Hilt scopes it above the conditional
     * mount), and cancels any in-flight collector before re-binding to a
     * new story so two conversation streams never race the same state.
     */
    fun load(storyId: String) {
        if (this.storyId == storyId) return
        this.storyId = storyId
        allConversations = emptyList()
        _state.update { StorySendToUiState(query = it.query, isLoading = true) }
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            conversationRepository.conversationsStream().collect { result ->
                val conversations = result.valueOrNull
                allConversations = conversations ?: allConversations
                _state.update { it.copy(isLoading = conversations == null) }
                recomputeTargets()
            }
        }
    }

    fun onQueryChange(query: String) {
        _state.update { it.copy(query = query) }
        recomputeTargets()
    }

    fun onCaptionChange(caption: String) {
        _state.update { it.copy(caption = caption) }
    }

    /**
     * Sends the bound story into [conversationId] with the current caption. A
     * send already in flight, an already-sent target, a blank caption, or no
     * signed-in user are all inert. The target stays "sending" only for the
     * duration of the local optimistic enqueue (parity with `forwardTo`) — the
     * bubble itself then rides the normal outbox retry machinery.
     */
    fun sendTo(conversationId: String) {
        val current = _state.value
        val story = storyId ?: return
        if (!current.canSend) return
        if (current.sendingConversationId != null) return
        if (conversationId in current.sentConversationIds) return
        val user = sessionRepository.currentUser.value ?: return

        _state.update { it.copy(sendingConversationId = conversationId, errorMessage = null) }
        viewModelScope.launch {
            try {
                messageRepository.sendOptimistic(
                    conversationId = conversationId,
                    content = current.caption,
                    originalLanguage = LanguageResolver.resolveUserLanguage(user),
                    sender = user,
                    storyReplyToId = story,
                )
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                _state.update {
                    it.copy(
                        sendingConversationId = null,
                        sentConversationIds = it.sentConversationIds + conversationId,
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(sendingConversationId = null, errorMessage = e.message) }
            }
        }
    }

    private fun recomputeTargets() {
        _state.update {
            it.copy(
                targets = StorySendTargets.of(
                    conversations = allConversations,
                    query = it.query,
                    currentUserId = sessionRepository.currentUser.value?.id,
                ),
            )
        }
    }
}
