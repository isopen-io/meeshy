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
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.chat.LocallyHiddenMessages
import me.meeshy.sdk.chat.LocallyHiddenMessagesStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.EmojiUsageRanker
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.MessageEditability
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.reaction.EmojiUsageStore
import me.meeshy.sdk.reaction.ReactionRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleContentBuilder
import javax.inject.Inject

data class ImageViewerTarget(
    val messageId: String,
    val imageIndex: Int,
)

data class ChatUiState(
    val messages: List<BubbleContent> = emptyList(),
    val draft: String = "",
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
    val typingParticipants: List<TypingParticipant> = emptyList(),
    val conversationTitle: String? = null,
    val memberCount: Int = 0,
    val isGroup: Boolean = false,
    val accentColorHex: String? = null,
    val actionMessageId: String? = null,
    val emojiPickerMessageId: String? = null,
    val quickReactions: List<String> = EmojiCatalog.defaultQuickReactions,
    val editingMessageId: String? = null,
    val replyingToMessageId: String? = null,
    val ownReactions: Map<String, Set<String>> = emptyMap(),
    val isLoadingOlder: Boolean = false,
    val hasMoreOlder: Boolean = true,
    val imageViewer: ImageViewerTarget? = null,
    val scrollToMessageId: String? = null,
    val search: ChatSearchState = ChatSearchState(),
    val mention: MentionAutocompleteState = MentionAutocompleteState(),
    val mentionDisplayNames: Map<String, String> = emptyMap(),
) {
    val canSend: Boolean get() = draft.isNotBlank()
    val isEditing: Boolean get() = editingMessageId != null
}

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository,
    private val sessionRepository: SessionRepository,
    private val reactionRepository: ReactionRepository,
    private val emojiUsageStore: EmojiUsageStore,
    private val locallyHiddenStore: LocallyHiddenMessagesStore,
    private val messageSocketManager: MessageSocketManager,
    private val workManager: WorkManager,
    private val config: MeeshyConfig,
    private val clock: CacheClock,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val conversationId: String = checkNotNull(savedStateHandle[CONVERSATION_ID_ARG]) {
        "ChatViewModel requires a '$CONVERSATION_ID_ARG' navigation argument"
    }

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    private val ownReactions = MutableStateFlow<Map<String, Set<String>>>(emptyMap())
    private val showingOriginal = MutableStateFlow<Set<String>>(emptySet())
    private val recipientCount = MutableStateFlow(0)
    private val typingCleanupJobs = mutableMapOf<String, Job>()
    private var latestMessages: List<LocalMessage> = emptyList()
    private var mentionRoster: List<MentionCandidate> = emptyList()
    private var avatarByUserId: Map<String, String?> = emptyMap()
    private var isEmittingTyping = false
    private var typingReemitJob: Job? = null
    private var typingIdleJob: Job? = null

    init {
        viewModelScope.launch { markConversationRead() }

        viewModelScope.launch {
            emojiUsageStore.usage.collect { usage ->
                val ordered = EmojiUsageRanker.topEmojis(
                    usage = usage,
                    defaults = EmojiCatalog.defaultQuickReactions,
                    count = QUICK_REACTION_COUNT,
                )
                _state.update { it.copy(quickReactions = ordered) }
            }
        }

        viewModelScope.launch {
            conversationRepository.conversationStream(conversationId).collect { conversation ->
                if (conversation == null) return@collect
                val currentUserId = sessionRepository.currentUser.value?.id
                val roster = MentionRoster.fromParticipants(
                    participants = conversation.participants,
                    excludeUserId = currentUserId,
                )
                mentionRoster = roster
                avatarByUserId = conversation.participants
                    .associate { (it.userId ?: it.id) to it.avatar }
                recipientCount.value = conversation.participants
                    .mapNotNull { it.userId }
                    .filterNot { it == currentUserId }
                    .distinct()
                    .size
                _state.update {
                    it.copy(
                        conversationTitle = conversation.displayTitle(currentUserId = currentUserId),
                        memberCount = conversation.memberCount,
                        isGroup = conversation.type.lowercase() != "direct",
                        accentColorHex = conversation.accentHex(),
                        mentionDisplayNames = MentionRoster.displayNames(roster),
                    )
                }
            }
        }

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
                ownReactions,
                showingOriginal,
                recipientCount,
            ) { result, user, own, originals, recipients ->
                BubbleInputs(result, user, own, originals, recipients)
            }
                .combine(locallyHiddenStore.hidden) { inputs, hidden -> inputs to hidden }
                .collect { (inputs, hidden) ->
                    val (result, user, own, originals, recipients) = inputs
                    latestMessages = result.valueOrNull() ?: latestMessages
                    _state.update { current ->
                        val next =
                            current.applyResult(result, user, own, originals, config.socketUrl, recipients, hidden)
                        next.copy(search = next.search.reconciled(next.messages.toSearchable()))
                    }
                }
        }

        viewModelScope.launch {
            launch {
                messageSocketManager.messageReceived.collect { event ->
                    if (event.conversationId == conversationId) {
                        messageRepository.refresh(conversationId)
                        markConversationRead()
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
            launch {
                messageSocketManager.reactionAdded.collect { event ->
                    applyPeerReactionEvent(event, delta = 1)
                }
            }
            launch {
                messageSocketManager.reactionRemoved.collect { event ->
                    applyPeerReactionEvent(event, delta = -1)
                }
            }
            launch {
                messageSocketManager.readStatusUpdated.collect { event ->
                    if (event.conversationId != conversationId) return@collect
                    val ownId = sessionRepository.currentUser.value?.id ?: return@collect
                    messageRepository.applyReadReceipt(
                        conversationId = conversationId,
                        ownSenderId = ownId,
                        deliveredCount = event.summary.deliveredCount,
                        readCount = event.summary.readCount,
                        frontierIso = event.updatedAt,
                    )
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
                            s.copy(
                                typingParticipants = TypingParticipants.started(
                                    current = s.typingParticipants,
                                    userId = event.userId,
                                    name = name,
                                    selfId = sessionRepository.currentUser.value?.id,
                                    avatarUrl = avatarByUserId[event.userId],
                                ),
                            )
                        }
                        typingCleanupJobs[event.userId] = viewModelScope.launch {
                            delay(TYPING_TIMEOUT_MS)
                            removeTypingUser(event.userId)
                        }
                    }
                }
            }
            launch {
                messageSocketManager.typingStopped.collect { event ->
                    if (event.conversationId == conversationId) {
                        typingCleanupJobs.remove(event.userId)?.cancel()
                        removeTypingUser(event.userId)
                    }
                }
            }
        }
    }

    /**
     * Mark-as-read never surfaces an error: the badge is non-critical and the
     * queued receipt retries with the outbox on reconnect.
     */
    private suspend fun markConversationRead() {
        try {
            if (conversationRepository.markReadOptimistic(conversationId)) {
                workManager.enqueue(OutboxFlushWorker.buildRequest())
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
        }
    }

    /**
     * Own echoes are skipped — the optimistic toggle already moved the cached
     * summary; replaying the echo would double-count it.
     */
    private suspend fun applyPeerReactionEvent(event: ReactionUpdateEvent, delta: Int) {
        if (event.conversationId != conversationId) return
        if (event.userId == sessionRepository.currentUser.value?.id) return
        messageRepository.applyReactionDelta(event.messageId, event.emoji, delta)
    }

    private fun removeTypingUser(userId: String) {
        _state.update { s -> s.copy(typingParticipants = TypingParticipants.stopped(s.typingParticipants, userId)) }
    }

    fun onDraftChange(value: String) {
        _state.update { it.copy(draft = value, mention = it.mention.onTextChange(value, mentionRoster)) }
        if (value.isBlank()) {
            stopTypingEmission()
        } else {
            startTypingEmission()
        }
    }

    /**
     * Insert the picked candidate's handle into the draft (replacing the trailing
     * `@fragment`), record it as a draft mention, and dismiss the suggestion panel.
     */
    fun onMentionSelected(candidate: MentionCandidate) {
        _state.update { current ->
            val (newDraft, newMention) = current.mention.select(candidate, current.draft)
            current.copy(draft = newDraft, mention = newMention)
        }
    }

    /**
     * Mirrors iOS ConversationSocketHandler: one `typing:start` on the first
     * keystroke, re-emitted every 3 s while typing continues (server timeouts),
     * one `typing:stop` after 3 s of silence, an emptied draft, or a send.
     */
    private fun startTypingEmission() {
        if (!isEmittingTyping) {
            isEmittingTyping = true
            messageSocketManager.emitTypingStart(conversationId)
            typingReemitJob = viewModelScope.launch {
                while (true) {
                    delay(TYPING_REEMIT_MS)
                    messageSocketManager.emitTypingStart(conversationId)
                }
            }
        }
        typingIdleJob?.cancel()
        typingIdleJob = viewModelScope.launch {
            delay(TYPING_IDLE_MS)
            stopTypingEmission()
        }
    }

    private fun stopTypingEmission() {
        typingReemitJob?.cancel()
        typingReemitJob = null
        typingIdleJob?.cancel()
        typingIdleJob = null
        if (!isEmittingTyping) return
        isEmittingTyping = false
        messageSocketManager.emitTypingStop(conversationId)
    }

    override fun onCleared() {
        stopTypingEmission()
        super.onCleared()
    }

    fun send() {
        val text = _state.value.draft.trim()
        if (text.isEmpty()) return
        stopTypingEmission()
        val editingId = _state.value.editingMessageId
        if (editingId != null) {
            applyEdit(editingId, text)
            return
        }
        val user = sessionRepository.currentUser.value ?: return
        val replyToId = _state.value.replyingToMessageId
        _state.update { it.copy(draft = "", replyingToMessageId = null, mention = it.mention.reset()) }
        viewModelScope.launch {
            try {
                messageRepository.sendOptimistic(
                    conversationId = conversationId,
                    content = text,
                    originalLanguage = user.systemLanguage ?: LanguageResolver.FALLBACK_LANGUAGE,
                    sender = user,
                    replyToId = replyToId,
                )
                workManager.enqueue(OutboxFlushWorker.buildRequest())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    fun onMessageLongPress(messageId: String) {
        _state.update { it.copy(actionMessageId = messageId) }
        viewModelScope.launch {
            val details = reactionRepository.fetchDetails(messageId).getOrNull() ?: return@launch
            ownReactions.update { it + (messageId to details.userReactions.toSet()) }
        }
    }

    fun dismissMessageActions() {
        _state.update { it.copy(actionMessageId = null) }
    }

    fun openImageViewer(messageId: String, imageIndex: Int) {
        _state.update { it.copy(imageViewer = ImageViewerTarget(messageId, imageIndex)) }
    }

    /**
     * A quoted-reply preview was tapped on the bubble [messageId]. When the quoted
     * original is currently loaded, request a scroll to it; a paged-out original or a
     * non-reply is inert (never a crash on an absent target). See [ReplyJumpResolver].
     */
    fun onReplyPreviewTap(messageId: String) {
        val links = _state.value.messages.map { ReplyLink(it.messageId, it.replyToId) }
        val target = (ReplyJumpResolver.resolve(messageId, links) as? ReplyJump.Scroll)?.targetMessageId
            ?: return
        _state.update { it.copy(scrollToMessageId = target) }
    }

    /** The pending reply-jump scroll has been performed by the screen. */
    fun onScrollHandled() {
        _state.update { it.copy(scrollToMessageId = null) }
    }

    fun dismissImageViewer() {
        _state.update { it.copy(imageViewer = null) }
    }

    fun openSearch() {
        _state.update { it.copy(search = it.search.activated()) }
    }

    fun closeSearch() {
        _state.update { it.copy(search = it.search.deactivated()) }
    }

    fun onSearchQueryChange(query: String) {
        _state.update { it.copy(search = it.search.withQuery(query, it.messages.toSearchable())) }
    }

    fun nextSearchMatch() {
        _state.update { it.copy(search = it.search.movedToNext()) }
    }

    fun previousSearchMatch() {
        _state.update { it.copy(search = it.search.movedToPrev()) }
    }

    fun toggleShowOriginal(messageId: String) {
        showingOriginal.update { if (messageId in it) it - messageId else it + messageId }
        _state.update { it.copy(actionMessageId = null) }
    }

    fun openEmojiPicker(messageId: String) {
        _state.update { it.copy(emojiPickerMessageId = messageId, actionMessageId = null) }
    }

    fun dismissEmojiPicker() {
        _state.update { it.copy(emojiPickerMessageId = null) }
    }

    fun toggleReaction(messageId: String, emoji: String) {
        val mine = ownReactions.value[messageId] ?: emptySet()
        val isAdding = emoji !in mine
        if (isAdding) emojiUsageStore.record(emoji)
        ownReactions.update { it + (messageId to if (isAdding) mine + emoji else mine - emoji) }
        _state.update { it.copy(actionMessageId = null, emojiPickerMessageId = null) }
        viewModelScope.launch {
            try {
                if (messageRepository.toggleReactionOptimistic(messageId, emoji, isAdding)) {
                    workManager.enqueue(OutboxFlushWorker.buildRequest())
                } else {
                    ownReactions.update { it + (messageId to mine) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ownReactions.update { it + (messageId to mine) }
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    fun startEdit(messageId: String) {
        val message = latestMessages.firstOrNull {
            it.message.id == messageId && it.sendState == LocalSendState.SYNCED
        }?.message ?: return
        if (message.deletedAt != null) return
        val editable = MessageEditability.canEdit(
            isOwn = message.senderId != null &&
                message.senderId == sessionRepository.currentUser.value?.id,
            createdAtMillis = isoToEpochMillisOrNull(message.createdAt),
            nowMillis = clock.nowMillis(),
        )
        if (!editable) return
        _state.update {
            it.copy(
                editingMessageId = messageId,
                draft = message.content,
                actionMessageId = null,
                replyingToMessageId = null,
            )
        }
    }

    fun startReply(messageId: String) {
        val message = latestMessages.firstOrNull {
            it.message.id == messageId && it.sendState == LocalSendState.SYNCED
        }?.message ?: return
        if (message.deletedAt != null) return
        _state.update {
            it.copy(
                replyingToMessageId = messageId,
                actionMessageId = null,
                editingMessageId = null,
                draft = if (it.isEditing) "" else it.draft,
            )
        }
    }

    fun cancelReply() {
        _state.update { it.copy(replyingToMessageId = null) }
    }

    fun cancelEdit() {
        _state.update { it.copy(editingMessageId = null, draft = "") }
    }

    /**
     * "Delete for everyone" — a server round-trip that tombstones the message
     * for all participants. Only offered for an own message within the
     * [me.meeshy.sdk.model.MessageDeletability] window (gated in the UI).
     */
    fun deleteForEveryone(messageId: String) {
        _state.update { it.copy(actionMessageId = null) }
        viewModelScope.launch {
            try {
                if (messageRepository.deleteOptimistic(messageId)) {
                    workManager.enqueue(OutboxFlushWorker.buildRequest())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    /**
     * "Delete for me" — hides the message locally only (WhatsApp-style), never
     * reaching the server. The durable [locallyHiddenStore] emits the new hidden
     * set, which the message stream re-filters, so the bubble disappears at once.
     */
    fun deleteForMe(messageId: String) {
        _state.update { it.copy(actionMessageId = null) }
        locallyHiddenStore.hide(messageId)
    }

    private fun applyEdit(messageId: String, content: String) {
        _state.update { it.copy(draft = "", editingMessageId = null) }
        viewModelScope.launch {
            try {
                if (messageRepository.editOptimistic(messageId, content)) {
                    workManager.enqueue(OutboxFlushWorker.buildRequest())
                }
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

    fun loadOlder() {
        val current = _state.value
        if (current.isLoadingOlder || !current.hasMoreOlder || current.messages.isEmpty()) return
        _state.update { it.copy(isLoadingOlder = true) }
        viewModelScope.launch {
            try {
                val hasMore = messageRepository.loadOlder(conversationId)
                _state.update { it.copy(isLoadingOlder = false, hasMoreOlder = hasMore) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isLoadingOlder = false, errorMessage = e.message) }
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
        private const val QUICK_REACTION_COUNT = 8
        private const val TYPING_TIMEOUT_MS = 5_000L
        private const val TYPING_REEMIT_MS = 3_000L
        private const val TYPING_IDLE_MS = 3_000L
    }
}

private data class BubbleInputs(
    val result: CacheResult<List<LocalMessage>>,
    val user: MeeshyUser?,
    val ownReactions: Map<String, Set<String>>,
    val showingOriginal: Set<String>,
    val recipientCount: Int,
)

private fun <T> CacheResult<List<T>>.valueOrNull(): List<T>? = when (this) {
    is CacheResult.Fresh -> value
    is CacheResult.Stale -> value
    is CacheResult.Syncing -> value
    CacheResult.Empty -> emptyList()
}

private fun ChatUiState.applyResult(
    result: CacheResult<List<LocalMessage>>,
    currentUser: MeeshyUser?,
    ownReactions: Map<String, Set<String>>,
    showingOriginal: Set<String>,
    mediaBaseUrl: String,
    recipientCount: Int,
    hidden: LocallyHiddenMessages,
): ChatUiState = when (result) {
    is CacheResult.Fresh -> copy(
        messages = result.value.toBubbles(currentUser, ownReactions, showingOriginal, mediaBaseUrl, recipientCount, hidden),
        ownReactions = ownReactions,
        isSyncing = false,
        showSkeleton = false,
        errorMessage = null,
    )
    is CacheResult.Stale -> copy(
        messages = result.value.toBubbles(currentUser, ownReactions, showingOriginal, mediaBaseUrl, recipientCount, hidden),
        ownReactions = ownReactions,
        isSyncing = true,
        showSkeleton = false,
    )
    is CacheResult.Syncing -> copy(
        messages = result.value?.toBubbles(currentUser, ownReactions, showingOriginal, mediaBaseUrl, recipientCount, hidden)
            ?: messages,
        ownReactions = ownReactions,
        isSyncing = true,
        showSkeleton = result.value == null && messages.isEmpty() && errorMessage == null,
    )
    CacheResult.Empty -> copy(
        messages = emptyList(),
        ownReactions = ownReactions,
        isSyncing = false,
        showSkeleton = errorMessage == null,
    )
}

private fun List<LocalMessage>.toBubbles(
    currentUser: MeeshyUser?,
    ownReactions: Map<String, Set<String>>,
    showingOriginal: Set<String>,
    mediaBaseUrl: String,
    recipientCount: Int,
    hidden: LocallyHiddenMessages,
): List<BubbleContent> = filterNot { hidden.isHidden(it.message.id) }.map { local ->
    BubbleContentBuilder.build(
        message = local.message,
        currentUserId = currentUser?.id,
        preferences = currentUser ?: EmptyContentPreferences,
        showSenderName = true,
        isPending = local.sendState == LocalSendState.SENDING,
        isFailed = local.sendState == LocalSendState.FAILED,
        ownReactions = ownReactions[local.message.id] ?: emptySet(),
        recipientCount = recipientCount,
        showOriginal = local.message.id in showingOriginal,
        mediaBaseUrl = mediaBaseUrl,
    )
}

/**
 * Project the visible bubbles into the opaque searchable model. Deleted bubbles
 * (placeholder text) and bubbles with no textual body (image/file only) carry no
 * searchable text and are skipped; the stored original is searched alongside the
 * displayed translation so search stays translation-match aware.
 */
private fun List<BubbleContent>.toSearchable(): List<SearchableMessage> =
    mapNotNull { bubble ->
        if (bubble.isDeleted) return@mapNotNull null
        val texts = listOfNotNull(bubble.text, bubble.originalText).filter { it.isNotBlank() }
        if (texts.isEmpty()) null else SearchableMessage(bubble.messageId, texts)
    }

private object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String? = null
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}
