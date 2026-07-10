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
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.chat.LocallyHiddenMessages
import me.meeshy.sdk.chat.LocallyHiddenMessagesStore
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.app.chat.translation.LanguageFlagTapResolver
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.EmojiUsageRanker
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.MessageEditability
import me.meeshy.sdk.model.MessagePinToggle
import me.meeshy.sdk.model.PinAction
import me.meeshy.sdk.model.StarredAttachmentKind
import me.meeshy.sdk.model.StarredMessage
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
    val reactionDetails: ReactionDetailsUiState? = null,
    val isPinnedSheetOpen: Boolean = false,
    val replyThreadParentId: String? = null,
    val forward: ForwardUiState? = null,
) {
    val canSend: Boolean get() = draft.isNotBlank()
    val isEditing: Boolean get() = editingMessageId != null

    /** Every currently-pinned message, newest-pin first — drives the pinned-messages sheet. */
    val pinnedMessages: List<PinnedMessageRow> get() = PinnedMessagesList.of(messages.map { it.toPinnable() })

    /** The pinned-message banner surfaced above the list, or null when nothing is pinned. */
    val pinnedBanner: PinnedBanner? get() = PinnedMessages.of(messages.map { it.toPinnable() })

    /**
     * The focused reply-thread overlay for [replyThreadParentId], derived live from the
     * loaded messages (a new reply appears in an open overlay). Null when closed, or when
     * the parent has drained to no live reply / paged out. See [ReplyThreadOverlay].
     */
    val replyThreadOverlay: ReplyThreadOverlayModel? get() =
        replyThreadParentId?.let { ReplyThreadOverlay.of(it, messages.map { m -> m.toThreadMessage() }) }
}

/**
 * State of the forward-picker sheet. `null` in [ChatUiState.forward] means the
 * sheet is closed. [sendingConversationId] gates the picker to one in-flight
 * forward at a time (parity with iOS, which disables every row while sending);
 * [sentConversationIds] keeps a checkmark on rows already forwarded to so the
 * user can forward one message to several conversations in one sitting.
 */
data class ForwardUiState(
    val sourceMessageId: String,
    val query: String = "",
    val targets: List<ForwardTarget> = emptyList(),
    val sendingConversationId: String? = null,
    val sentConversationIds: Set<String> = emptySet(),
)

private fun BubbleContent.toPinnable(): PinnableMessage = object : PinnableMessage {
    override val id: String = messageId
    override val pinnedAtIso: String? = this@toPinnable.pinnedAtIso
    override val isDeleted: Boolean = this@toPinnable.isDeleted
    override val isOutgoing: Boolean = this@toPinnable.isOutgoing
    override val senderName: String? = this@toPinnable.senderName
    override val text: String = this@toPinnable.text
    override val hasImage: Boolean = images.isNotEmpty()
    override val hasFile: Boolean = files.isNotEmpty()
}

private fun BubbleContent.toThreadMessage(): ThreadMessage = object : ThreadMessage {
    override val id: String = messageId
    override val replyToId: String? = this@toThreadMessage.replyToId
    override val isDeleted: Boolean = this@toThreadMessage.isDeleted
    override val isOutgoing: Boolean = this@toThreadMessage.isOutgoing
    override val senderName: String? = this@toThreadMessage.senderName
    override val text: String = this@toThreadMessage.text
    override val hasImage: Boolean = images.isNotEmpty()
    override val hasFile: Boolean = files.isNotEmpty()
}

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository,
    private val sessionRepository: SessionRepository,
    private val reactionRepository: ReactionRepository,
    private val emojiUsageStore: EmojiUsageStore,
    private val locallyHiddenStore: LocallyHiddenMessagesStore,
    private val starredStore: StarredMessagesStore,
    private val messageSocketManager: MessageSocketManager,
    private val workManager: WorkManager,
    private val config: MeeshyConfig,
    private val clock: CacheClock,
    private val draftStore: ConversationDraftStore,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val conversationId: String = checkNotNull(savedStateHandle[CONVERSATION_ID_ARG]) {
        "ChatViewModel requires a '$CONVERSATION_ID_ARG' navigation argument"
    }

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    private val ownReactions = MutableStateFlow<Map<String, Set<String>>>(emptyMap())
    private val showingOriginal = MutableStateFlow<Set<String>>(emptySet())

    /**
     * messageId -> the language code the viewer switched that bubble to via a flag
     * tap. Absent = default Prisme resolution (preferred translation, or the
     * original toggled through [showingOriginal]).
     */
    private val activeLanguageOverride = MutableStateFlow<Map<String, String>>(emptyMap())
    private val recipientCount = MutableStateFlow(0)
    private val typingCleanupJobs = mutableMapOf<String, Job>()
    private var latestMessages: List<LocalMessage> = emptyList()
    private var allConversations: List<ApiConversation> = emptyList()
    private var mentionRoster: List<MentionCandidate> = emptyList()
    private var avatarByUserId: Map<String, String?> = emptyMap()
    private var isEmittingTyping = false
    private var typingReemitJob: Job? = null
    private var typingIdleJob: Job? = null
    private var lastPersistedDraft: ConversationDraft? = null
    private var draftPersistJob: Job? = null

    /**
     * sourceMessageId -> target conversation currently being forwarded to.
     * Durable across closeForward()/openForward() (unlike ForwardUiState, which
     * is recreated on open) so a dismiss-and-reopen mid-send can't lose the
     * in-flight guard and let a second forwardTo() double-send the message.
     */
    private val sendingForwards = mutableMapOf<String, String>()

    init {
        viewModelScope.launch { markConversationRead() }

        viewModelScope.launch {
            val stored = draftStore.load(conversationId)
            lastPersistedDraft = stored?.takeIf { it.text.isNotBlank() || it.replyToId != null }
            _state.update { current ->
                val restored = DraftAutosave.restore(stored, current.draft, current.isEditing)
                if (restored != null) {
                    current.copy(draft = restored.text, replyingToMessageId = restored.replyToId)
                } else {
                    current
                }
            }
        }

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
            conversationRepository.conversationsStream().collect { result ->
                allConversations = result.valueOrNull() ?: allConversations
                recomputeForwardTargets()
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
                .combine(starredStore.starred) { (inputs, hidden), starred ->
                    Triple(inputs, hidden, starred.ids)
                }
                .combine(activeLanguageOverride) { triple, overrides -> triple to overrides }
                .collect { (triple, overrides) ->
                    val (inputs, hidden, starredIds) = triple
                    val (result, user, own, originals, recipients) = inputs
                    latestMessages = result.valueOrNull() ?: latestMessages
                    _state.update { current ->
                        val next = current.applyResult(
                            result, user, own, originals, config.socketUrl, recipients, hidden, starredIds, overrides,
                        )
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
                messageSocketManager.messagePinned.collect { event ->
                    if (event.conversationId == conversationId) {
                        messageRepository.refresh(conversationId)
                    }
                }
            }
            launch {
                messageSocketManager.messageUnpinned.collect { event ->
                    if (event.conversationId == conversationId) {
                        messageRepository.refresh(conversationId)
                    }
                }
            }
            launch {
                messageSocketManager.translationCompleted.collect { event ->
                    if (event.conversationId == conversationId) {
                        messageRepository.applyTranslation(
                            event.messageId,
                            event.targetLanguage,
                            event.translatedContent,
                        )
                    }
                }
            }
            launch {
                messageSocketManager.translationInProgress.collect { event ->
                    if (event.conversationId == conversationId) {
                        messageRepository.applyTranslation(
                            event.messageId,
                            event.targetLanguage,
                            event.translatedContent,
                        )
                    }
                }
            }
            launch {
                messageSocketManager.transcriptionReady.collect { event ->
                    if (event.conversationId == conversationId) {
                        messageRepository.applyTranscription(
                            event.messageId,
                            event.attachmentId,
                            event.text,
                            event.language,
                            event.confidence,
                            event.durationMs,
                        )
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
        persistDraft(value, _state.value.replyingToMessageId)
    }

    /**
     * Best-effort auto-save of the new-message composer to the durable
     * [draftStore] (iOS `ConversationDraftManager`). Never persists while an
     * edit is in flight — the edit content is not a draft — and skips the write
     * entirely when the store already matches ([DraftAutosave.resolve] → [DraftPersist.None]).
     * The single [draftPersistJob] coalesces rapid keystrokes to a last-write-wins.
     * [replyToId] carries the currently-armed reply so it is persisted alongside the text
     * (iOS app-side `DraftStore` reply-reference parity).
     */
    private fun persistDraft(rawText: String, replyToId: String?) {
        if (_state.value.isEditing) return
        val decision = DraftAutosave.resolve(
            conversationId = conversationId,
            rawText = rawText,
            replyToId = replyToId,
            nowIso = java.time.Instant.ofEpochMilli(clock.nowMillis()).toString(),
            previous = lastPersistedDraft,
        )
        lastPersistedDraft = when (decision) {
            is DraftPersist.Save -> decision.draft
            is DraftPersist.Clear -> null
            DraftPersist.None -> return
        }
        draftPersistJob?.cancel()
        draftPersistJob = viewModelScope.launch {
            try {
                when (decision) {
                    is DraftPersist.Save -> draftStore.save(decision.draft)
                    is DraftPersist.Clear -> draftStore.clear(decision.conversationId)
                    DraftPersist.None -> Unit
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Draft persistence is best-effort; a failed write never disrupts composing.
            }
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
        persistDraft("", replyToId = null)
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
     * Open the who-reacted sheet for [messageId]. Shows immediately (cache-first:
     * the sheet appears with an empty, loading breakdown) then fills in the
     * reactor list from a fresh detail fetch. A failed fetch leaves the sheet
     * on an empty (non-loading) breakdown rather than crashing. Reuses the
     * fetch to refresh `ownReactions` too. See [ReactionBreakdown].
     */
    fun openReactionDetails(messageId: String) {
        _state.update {
            it.copy(
                reactionDetails = ReactionDetailsUiState(
                    messageId = messageId,
                    isLoading = true,
                    breakdown = ReactionBreakdown(emptyList()),
                ),
            )
        }
        viewModelScope.launch {
            val details = reactionRepository.fetchDetails(messageId).getOrNull()
            if (details != null) {
                ownReactions.update { it + (messageId to details.userReactions.toSet()) }
            }
            val currentUserId = sessionRepository.currentUser.value?.id.orEmpty()
            val breakdown = details?.let { ReactionBreakdown.of(it, currentUserId) }
                ?: ReactionBreakdown(emptyList())
            _state.update { state ->
                val open = state.reactionDetails
                if (open == null || open.messageId != messageId) return@update state
                state.copy(reactionDetails = open.copy(isLoading = false, breakdown = breakdown))
            }
        }
    }

    /** Select a tab in the open who-reacted sheet; an out-of-range index is inert. */
    fun selectReactionTab(index: Int) {
        _state.update { it.copy(reactionDetails = it.reactionDetails?.withSelectedTab(index)) }
    }

    /** Dismiss the who-reacted sheet. */
    fun closeReactionDetails() {
        _state.update { it.copy(reactionDetails = null) }
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

    /**
     * The reply-count pill on message [messageId] was tapped: scroll to the first
     * reply in its thread. A message with no replies has no thread and is inert.
     * See [ReplyThreads].
     */
    fun onReplyCountTap(messageId: String) {
        val links = _state.value.messages.map { ReplyLink(it.messageId, it.replyToId, it.isDeleted) }
        val thread = ReplyThreads.of(links).threadFor(messageId) ?: return
        _state.update { it.copy(scrollToMessageId = thread.firstReplyId) }
    }

    /**
     * Long-pressing the reply-count pill on message [messageId] opens the focused
     * reply-thread overlay (the pill *tap* still scrolls to the first reply). Inert when
     * the message has no live thread — no empty overlay. See [ReplyThreadOverlay].
     */
    fun openReplyThread(messageId: String) {
        val links = _state.value.messages.map { it.toThreadMessage() }
        if (ReplyThreadOverlay.of(messageId, links) == null) return
        _state.update { it.copy(replyThreadParentId = messageId) }
    }

    /** Dismisses the reply-thread overlay. */
    fun closeReplyThread() {
        _state.update { it.copy(replyThreadParentId = null) }
    }

    /**
     * A reply row in the thread overlay was tapped: scroll to that reply and close the
     * overlay. A messageId not among the overlay's current replies is inert (never a
     * crash on a since-removed / absent target).
     */
    fun onReplyThreadReplyTap(messageId: String) {
        val overlay = _state.value.replyThreadOverlay ?: return
        if (overlay.replies.none { it.messageId == messageId }) return
        _state.update { it.copy(scrollToMessageId = messageId, replyThreadParentId = null) }
    }

    /**
     * The pinned-message banner was tapped: scroll to the newest pinned message.
     * When nothing is pinned the banner is absent, so this is inert.
     * See [PinnedMessages].
     */
    fun onPinnedBannerTap() {
        val target = _state.value.pinnedBanner?.messageId ?: return
        _state.update { it.copy(scrollToMessageId = target) }
    }

    /**
     * Opens the full pinned-messages sheet (the banner shows one at a time; the
     * sheet lists every pin). Inert when nothing is pinned — no empty sheet.
     * See [PinnedMessagesList].
     */
    fun openPinnedSheet() {
        if (_state.value.pinnedMessages.isEmpty()) return
        _state.update { it.copy(isPinnedSheetOpen = true) }
    }

    /** Dismisses the pinned-messages sheet. */
    fun closePinnedSheet() {
        _state.update { it.copy(isPinnedSheetOpen = false) }
    }

    /**
     * A row in the pinned-messages sheet was tapped: scroll to that message and
     * close the sheet. A messageId not among the currently-pinned messages is inert
     * (never a crash on a since-unpinned/absent target).
     */
    fun onPinnedMessageTap(messageId: String) {
        if (_state.value.pinnedMessages.none { it.messageId == messageId }) return
        _state.update { it.copy(scrollToMessageId = messageId, isPinnedSheetOpen = false) }
    }

    /** The pending reply-jump scroll has been performed by the screen. */
    /**
     * Open the forward-picker sheet for [messageId]. Dismisses the long-press
     * action sheet and paints the eligible targets cache-first from whatever
     * conversation list is already loaded (the collector fills it in live).
     */
    fun openForward(messageId: String) {
        _state.update {
            it.copy(
                actionMessageId = null,
                forward = ForwardUiState(
                    sourceMessageId = messageId,
                    sendingConversationId = sendingForwards[messageId],
                ),
            )
        }
        recomputeForwardTargets()
    }

    fun onForwardQueryChange(query: String) {
        _state.update { s -> s.forward?.let { s.copy(forward = it.copy(query = query)) } ?: s }
        recomputeForwardTargets()
    }

    fun closeForward() {
        _state.update { it.copy(forward = null) }
    }

    /**
     * Optimistically forward the source message into [targetConversationId]: the
     * original content is re-sent there carrying the `forwardedFrom` refs (the
     * gateway resolves attachments from the original). Only a server-acked source
     * can be forwarded — an unsent bubble has no id the gateway knows. One
     * forward is in flight at a time; an already-forwarded target is inert.
     */
    fun forwardTo(targetConversationId: String) {
        val forward = _state.value.forward ?: return
        val sourceMessageId = forward.sourceMessageId
        if (sendingForwards.containsKey(sourceMessageId)) return
        if (targetConversationId in forward.sentConversationIds) return
        val user = sessionRepository.currentUser.value ?: return
        val source = latestMessages
            .firstOrNull { it.message.id == sourceMessageId && it.sendState == LocalSendState.SYNCED }
            ?.message ?: return
        sendingForwards[sourceMessageId] = targetConversationId
        _state.update { s ->
            if (s.forward?.sourceMessageId == sourceMessageId) {
                s.copy(forward = s.forward.copy(sendingConversationId = targetConversationId))
            } else {
                s
            }
        }
        viewModelScope.launch {
            try {
                messageRepository.sendOptimistic(
                    conversationId = targetConversationId,
                    content = source.content,
                    originalLanguage = source.originalLanguage ?: LanguageResolver.FALLBACK_LANGUAGE,
                    sender = user,
                    forwardedFromId = source.id,
                    forwardedFromConversationId = conversationId,
                )
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                sendingForwards.remove(sourceMessageId)
                _state.update { s ->
                    if (s.forward?.sourceMessageId == sourceMessageId) {
                        s.copy(
                            forward = s.forward.copy(
                                sendingConversationId = null,
                                sentConversationIds = s.forward.sentConversationIds + targetConversationId,
                            ),
                        )
                    } else {
                        s
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                sendingForwards.remove(sourceMessageId)
                _state.update { s ->
                    val forwardUpdate = if (s.forward?.sourceMessageId == sourceMessageId) {
                        s.forward.copy(sendingConversationId = null)
                    } else {
                        s.forward
                    }
                    s.copy(errorMessage = e.message, forward = forwardUpdate)
                }
            }
        }
    }

    private fun recomputeForwardTargets() {
        _state.update { s ->
            val forward = s.forward ?: return@update s
            s.copy(
                forward = forward.copy(
                    targets = ForwardTargets.of(
                        conversations = allConversations,
                        sourceConversationId = conversationId,
                        query = forward.query,
                        currentUserId = sessionRepository.currentUser.value?.id,
                    ),
                ),
            )
        }
    }

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

    /**
     * Tap on a Prisme language-flag chip: switch the bubble's displayed language,
     * or revert to the default resolution when the tapped flag is already active.
     * Delegates the decision to the pure [LanguageFlagTapResolver] so the transition
     * stays behaviour-tested; here we only apply it to the per-message override map.
     */
    fun onFlagTap(messageId: String, code: String) {
        val message = latestMessages.firstOrNull { it.message.id == messageId }?.message ?: return
        val prefs = sessionRepository.currentUser.value ?: EmptyContentPreferences
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = code,
            activeCode = resolvedActiveCode(messageId, message, prefs),
            originalLanguage = message.originalLanguage,
            translations = message.translations,
        )
        when (result) {
            is LanguageFlagTapResolver.Result.Activate ->
                activeLanguageOverride.update { it + (messageId to result.code) }
            LanguageFlagTapResolver.Result.Revert ->
                activeLanguageOverride.update { it - messageId }
            // Requesting an on-demand translation for a content-less language is the
            // next slice; today the strip never surfaces such a flag, so this is inert.
            is LanguageFlagTapResolver.Result.RequestTranslation -> Unit
            LanguageFlagTapResolver.Result.None -> Unit
        }
    }

    /**
     * The language code currently displayed for [messageId]: an explicit flag-tap
     * override if any, else the default Prisme resolution — the original when the
     * translate toggle is on, otherwise the preferred translation (or the original
     * when none is preferred).
     */
    private fun resolvedActiveCode(
        messageId: String,
        message: ApiMessage,
        prefs: LanguageResolver.ContentLanguagePreferences,
    ): String? {
        activeLanguageOverride.value[messageId]?.let { return it.normalizedCode() }
        val original = message.originalLanguage.normalizedCode()
        if (messageId in showingOriginal.value) return original
        return LanguageResolver.preferredTranslation(message.translations, prefs)
            ?.targetLanguage?.normalizedCode()
            ?: original
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
        persistDraft(_state.value.draft, replyToId = messageId)
    }

    fun cancelReply() {
        _state.update { it.copy(replyingToMessageId = null) }
        persistDraft(_state.value.draft, replyToId = null)
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

    /**
     * Pin or unpin a message (iOS `ConversationViewModel.togglePin`): the pin
     * state flips optimistically in the cache and a durable pin/unpin mutation is
     * queued, so the banner reacts instantly and the server sync/rollback follows.
     * A deleted (or otherwise unresolvable) bubble is inert — see [MessagePinToggle].
     */
    fun togglePin(messageId: String) {
        val bubble = _state.value.messages.firstOrNull { it.messageId == messageId }
        val pin = when (MessagePinToggle.resolve(bubble?.isDeleted ?: true, bubble?.pinnedAtIso)) {
            PinAction.Pin -> true
            PinAction.Unpin -> false
            PinAction.Unavailable -> {
                _state.update { it.copy(actionMessageId = null) }
                return
            }
        }
        _state.update { it.copy(actionMessageId = null) }
        viewModelScope.launch {
            try {
                if (messageRepository.setPinnedOptimistic(messageId, pin)) {
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
     * Star or unstar a message (iOS `ConversationViewModel.toggleStar`). Starring
     * is local-only — no network, no outbox — so this delegates straight to the
     * durable [starredStore], which re-emits the starred set and re-renders the
     * bubble's star indicator at once (mirrors [deleteForMe]). A deleted or
     * unknown bubble is inert: only the sheet closes. The snapshot carries
     * everything a starred-messages list needs to render + navigate back.
     */
    fun toggleStar(messageId: String) {
        val bubble = _state.value.messages.firstOrNull { it.messageId == messageId }
        _state.update { it.copy(actionMessageId = null) }
        if (bubble == null || bubble.isDeleted) return
        starredStore.toggle(bubble.toStarSnapshot())
    }

    private fun BubbleContent.toStarSnapshot(): StarredMessage = StarredMessage(
        messageId = messageId,
        conversationId = conversationId,
        conversationName = _state.value.conversationTitle,
        conversationAccentColor = _state.value.accentColorHex,
        senderName = senderName,
        contentPreview = text,
        attachmentKind = when {
            images.isNotEmpty() -> StarredAttachmentKind.IMAGE
            files.isNotEmpty() -> StarredAttachmentKind.FILE
            else -> null
        },
        starredAtMillis = clock.nowMillis(),
        sentAtIso = createdAtIso,
    )

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

private fun String?.normalizedCode(): String? =
    this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }

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
    starredIds: Set<String>,
    activeLanguageOverride: Map<String, String>,
): ChatUiState {
    val updated = when (result) {
        is CacheResult.Fresh -> copy(
            messages = result.value.toBubbles(currentUser, ownReactions, showingOriginal, mediaBaseUrl, recipientCount, hidden, starredIds, activeLanguageOverride),
            ownReactions = ownReactions,
            isSyncing = false,
            showSkeleton = false,
            errorMessage = null,
        )
        is CacheResult.Stale -> copy(
            messages = result.value.toBubbles(currentUser, ownReactions, showingOriginal, mediaBaseUrl, recipientCount, hidden, starredIds, activeLanguageOverride),
            ownReactions = ownReactions,
            isSyncing = true,
            showSkeleton = false,
        )
        is CacheResult.Syncing -> copy(
            messages = result.value?.toBubbles(currentUser, ownReactions, showingOriginal, mediaBaseUrl, recipientCount, hidden, starredIds, activeLanguageOverride)
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
    // Standing invariant, not just an open()-time guard (see openPinnedSheet's doc
    // comment "no empty sheet"): if the last pin drains away — peer/self unpin, or
    // the pinned message gets deleted — while the sheet is already open, close it
    // here too. Resetting isPinnedSheetOpen itself (not just hiding the rendering)
    // matters: a later new pin must require an explicit re-open, not silently
    // resurrect a sheet the user already dismissed by running out of content.
    val pinReconciled = if (updated.isPinnedSheetOpen && updated.pinnedMessages.isEmpty()) {
        updated.copy(isPinnedSheetOpen = false)
    } else {
        updated
    }
    // Same standing invariant for the reply-thread overlay: if the focused thread drains
    // to no live reply (every reply deleted) or its parent pages out while the overlay is
    // open, close it — no dead-end empty overlay, and a later new reply requires an
    // explicit re-open rather than silently resurrecting a dismissed overlay.
    return if (pinReconciled.replyThreadParentId != null && pinReconciled.replyThreadOverlay == null) {
        pinReconciled.copy(replyThreadParentId = null)
    } else {
        pinReconciled
    }
}

private fun List<LocalMessage>.toBubbles(
    currentUser: MeeshyUser?,
    ownReactions: Map<String, Set<String>>,
    showingOriginal: Set<String>,
    mediaBaseUrl: String,
    recipientCount: Int,
    hidden: LocallyHiddenMessages,
    starredIds: Set<String>,
    activeLanguageOverride: Map<String, String>,
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
        activeLanguageCode = activeLanguageOverride[local.message.id],
        mediaBaseUrl = mediaBaseUrl,
    ).copy(isStarred = local.message.id in starredIds)
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
