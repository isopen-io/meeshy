package me.meeshy.app.chat

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import java.net.URLDecoder
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.call.ActiveCallRepository
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.chat.LocallyHiddenMessagesStore
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.composer.SlowModePolicy
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.media.NetworkConditionMonitor
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.sdk.model.LiveLocationEventFold
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.MessagePinToggle
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.PinAction
import me.meeshy.sdk.model.StarredAttachmentKind
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.reaction.EmojiUsageStore
import me.meeshy.sdk.reaction.ReactionRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.AnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.TypingPresenceRelay
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.sdk.theme.otherParticipantUserId
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * The conversation screen's ViewModel: it owns the single [ChatUiState] and the lifecycle
 * (init wiring, socket frames, teardown), and delegates each responsibility to a controller
 * built from its own constructor dependencies — [ChatComposerController] (draft, mentions,
 * send), [ChatReactionController], [ChatTranslationController] (Prisme gestures) and
 * [ChatReplyJumpController]. Its public functions keep their signatures; the screen never
 * knows which controller answers.
 *
 * Further slices are contributed as [ChatController]s through the `@IntoSet` multibinding
 * ([ChatControllerModule]); each holds its own state and is reached from [controllers] — no
 * lot adds a field to [ChatUiState].
 */
@HiltViewModel
class ChatViewModel @Inject constructor(
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository,
    private val sessionRepository: SessionRepository,
    reactionRepository: ReactionRepository,
    emojiUsageStore: EmojiUsageStore,
    private val locallyHiddenStore: LocallyHiddenMessagesStore,
    private val starredStore: StarredMessagesStore,
    private val messageSocketManager: MessageSocketManager,
    private val typingPresenceRelay: TypingPresenceRelay,
    private val workManager: WorkManager,
    private val config: MeeshyConfig,
    private val clock: CacheClock,
    draftStore: ConversationDraftStore,
    private val activeCallRepository: ActiveCallRepository,
    private val reportRepository: ReportRepository,
    mediaUploadQueue: MediaUploadQueue,
    mentionSearch: MentionSearch,
    anonymousSessionStore: AnonymousSessionStore,
    private val privacyPreferencesStore: PrivacyPreferencesStore,
    private val networkConditionMonitor: NetworkConditionMonitor,
    private val fileAttachmentDownloader: FileAttachmentDownloader,
    savedStateHandle: SavedStateHandle,
    contributedControllers: Set<@JvmSuppressWildcards ChatController> = emptySet(),
) : ViewModel() {

    private val conversationId: String = checkNotNull(savedStateHandle[CONVERSATION_ID_ARG]) {
        "ChatViewModel requires a '$CONVERSATION_ID_ARG' navigation argument"
    }

    /**
     * An incoming quick-reply/deep-link draft (`meeshy://conversation/{id}?draft=...`),
     * e.g. from a future Quick Reply widget. Seeded into [_state] below so it wins over
     * whatever [DraftAutosave.restore] would otherwise restore from the draft store — that
     * function's own idle guard (`currentDraft.isNotBlank() -> null`) already refuses to
     * clobber a non-empty composer, so no separate precedence rule is needed here; a
     * blank/absent arg leaves the composer empty exactly as before, letting the stored
     * draft restore normally.
     */
    private val initialDraft: String? = savedStateHandle.get<String>(DRAFT_ARG)
        ?.let { runCatching { URLDecoder.decode(it, "UTF-8") }.getOrDefault(it) }
        ?.takeIf { it.isNotBlank() }

    private val _state = MutableStateFlow(ChatUiState(conversationId = conversationId, draft = initialDraft.orEmpty()))
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    private val recipientCount = MutableStateFlow(0)
    private val typingCleanupJobs = mutableMapOf<String, Job>()

    /**
     * #5189 — per-message memoization for [BubbleContentBuilder.build], owned
     * by this ViewModel instance (one cache per conversation screen). See its
     * own doc-comment for why the combine chain feeding the bubble projection must not
     * re-run Prisme resolution for a message none of the changed inputs concern.
     */
    private val bubbleMemo = BubbleMemoCache()

    /**
     * The cached message window behind the bubbles, mirrored from the cache stream — read
     * by the controllers and the language-explorer projection, which rebuilds live off it
     * (a translation landing → new content).
     */
    private val latestMessages = MutableStateFlow<List<LocalMessage>>(emptyList())
    private var avatarByUserId: Map<String, String?> = emptyMap()

    /**
     * The conversation's unread count captured from the cache **before** the open
     * marks it read — the input to the [UnreadMarker] boundary. Null until the
     * first conversation emission has been read.
     */
    private val initialUnreadCount = MutableStateFlow<Int?>(null)

    private val screenState = ChatStateAccess(_state)

    private val composer = ChatComposerController(
        scope = viewModelScope,
        state = screenState,
        conversationId = conversationId,
        messages = latestMessages,
        messageRepository = messageRepository,
        sessionRepository = sessionRepository,
        draftStore = draftStore,
        mediaUploadQueue = mediaUploadQueue,
        mentionSearch = mentionSearch,
        anonymousSessionStore = anonymousSessionStore,
        messageSocketManager = messageSocketManager,
        workManager = workManager,
        clock = clock,
        pendingTray = { controllers.find<ComposerTrayController>() },
    )

    private val reactions = ChatReactionController(
        scope = viewModelScope,
        state = screenState,
        conversationId = conversationId,
        messageRepository = messageRepository,
        reactionRepository = reactionRepository,
        sessionRepository = sessionRepository,
        emojiUsageStore = emojiUsageStore,
        messageSocketManager = messageSocketManager,
        workManager = workManager,
    )

    private val translation = ChatTranslationController(
        scope = viewModelScope,
        state = screenState,
        messages = latestMessages,
        messageRepository = messageRepository,
        sessionRepository = sessionRepository,
        messageSocketManager = messageSocketManager,
        conversationId = conversationId,
    )

    private val replyJump = ChatReplyJumpController(screenState)

    private val forward = ChatForwardController(
        scope = viewModelScope,
        state = screenState,
        conversationId = conversationId,
        messages = latestMessages,
        messageRepository = messageRepository,
        sessionRepository = sessionRepository,
        workManager = workManager,
    )

    private val fileDownload = ChatFileDownloadController(
        scope = viewModelScope,
        state = screenState,
        messages = latestMessages,
        downloader = fileAttachmentDownloader,
        config = config,
    )

    /** The controllers lots contributed to this conversation, looked up by type. */
    val controllers: ChatControllers = ChatControllers(contributedControllers)

    init {
        // Capture the unread count from the cached conversation BEFORE marking it
        // read (which zeroes it), then mark read. The first Room emission carries
        // the current cached value, so this never blocks beyond it.
        viewModelScope.launch {
            initialUnreadCount.value =
                conversationRepository.conversationStream(conversationId).first()?.unreadCount ?: 0
            markConversationRead()
        }

        // Latch the "new messages" boundary once, when both the initial unread
        // count and a non-empty message window are known. A later message arrival
        // never re-derives it (the boundary is stable for the session).
        viewModelScope.launch {
            val count = initialUnreadCount.filterNotNull().first()
            val bubbles = _state.map { it.messages }.first { it.isNotEmpty() }
            val firstUnread = UnreadMarker.firstUnreadId(bubbles, count)
            _state.update {
                it.copy(firstUnreadMessageId = firstUnread, unreadBoundaryResolved = true)
            }
        }

        viewModelScope.launch { composer.loadComposerPermissions() }

        refreshActiveCall()

        viewModelScope.launch { composer.restoreStoredDraft() }

        reactions.start()

        viewModelScope.launch {
            conversationRepository.conversationStream(conversationId).collect { conversation ->
                if (conversation == null) return@collect
                val currentUserId = sessionRepository.currentUser.value?.id
                val roster = MentionRoster.fromParticipants(
                    participants = conversation.participants,
                    excludeUserId = currentUserId,
                )
                composer.updateMentionRoster(roster)
                avatarByUserId = conversation.participants
                    .associate { (it.userId ?: it.id) to it.avatar }
                recipientCount.value = conversation.participants
                    .mapNotNull { it.userId }
                    .filterNot { it == currentUserId }
                    .distinct()
                    .size
                val viewerRole = conversation.participants
                    .firstOrNull { it.userId == currentUserId }
                    ?.role
                _state.update {
                    it.copy(
                        conversationTitle = conversation.displayTitle(currentUserId = currentUserId),
                        memberCount = conversation.memberCount,
                        isGroup = conversation.type.lowercase() != "direct",
                        accentColorHex = conversation.accentHex(),
                        mentionDisplayNames = MentionRoster.displayNames(roster),
                        slowModeSeconds = conversation.slowModeSeconds,
                        slowModeExempt = SlowModePolicy.isExemptRole(viewerRole),
                        encryptionMode = conversation.encryptionMode,
                        directPeerUserId = conversation.otherParticipantUserId(currentUserId),
                        composerLanguageSeed = sessionRepository.currentUser.value
                            ?.let { user -> LanguageResolver.resolveUserLanguage(user) }
                            ?: it.composerLanguageSeed,
                    )
                }
            }
        }

        observePresence()

        viewModelScope.launch {
            conversationRepository.conversationsStream().collect { result ->
                forward.onConversationsLoaded(result.windowOrNull())
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
                reactions.ownReactions,
                translation.showingOriginal,
                recipientCount,
            ) { result, user, own, originals, recipients ->
                BubbleInputs(result, user, own, originals, recipients)
            }
                .combine(locallyHiddenStore.hidden) { inputs, hidden -> inputs to hidden }
                .combine(starredStore.starred) { (inputs, hidden), starred ->
                    Triple(inputs, hidden, starred.ids)
                }
                .combine(translation.activeLanguageOverride) { triple, overrides -> triple to overrides }
                .combine(
                    privacyPreferencesStore.preferences
                        .map { it.showReadReceipts }
                        .distinctUntilChanged(),
                ) { pair, showReadReceipts -> pair to showReadReceipts }
                .combine(
                    networkConditionMonitor.condition
                        .map { it == NetworkCondition.OFFLINE }
                        .distinctUntilChanged(),
                ) { data, isOffline -> data to isOffline }
                .collect { (data, isOffline) ->
                    val (pair, showReadReceipts) = data
                    val (triple, overrides) = pair
                    val (inputs, hidden, starredIds) = triple
                    val (result, user, own, originals, recipients) = inputs
                    latestMessages.value = result.windowOrNull() ?: latestMessages.value
                    _state.update { current ->
                        val next = current.applyResult(
                            result, user, own, originals, config.apiBaseUrl, recipients, hidden, starredIds,
                            overrides, showReadReceipts, isOffline, bubbleMemo,
                        )
                        next.copy(
                            search = next.search.reconciled(next.messages.toSearchable()),
                            isOffline = isOffline,
                        )
                    }
                }
        }

        translation.start()

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
                // Server-initiated twin of messageDeleted for a self-destructing
                // message burned by ExpiredMessagesCleanupService — same local
                // effect (refresh drops the burned message from the list).
                messageSocketManager.messageExpired.collect { event ->
                    if (event.conversationId == conversationId) {
                        messageRepository.refresh(conversationId)
                    }
                }
            }
            launch {
                messageSocketManager.messageEdited.collect { event ->
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
                messageSocketManager.transcriptionReady.collect { event ->
                    if (event.conversationId == conversationId) {
                        messageRepository.applyTranscription(
                            event.messageId,
                            event.attachmentId,
                            event.transcription.text,
                            event.transcription.language,
                            event.transcription.confidence,
                            event.transcription.durationMs,
                        )
                    }
                }
            }
            launch {
                messageSocketManager.audioTranslationReady.collect { event ->
                    if (event.conversationId == conversationId) {
                        val audio = event.translatedAudio
                        messageRepository.applyAudioTranslation(
                            event.messageId,
                            event.attachmentId,
                            event.language,
                            audio.url,
                            audio.transcription,
                            audio.durationMs,
                            audio.format,
                            audio.cloned,
                            audio.quality,
                            audio.voiceModelId,
                            audio.ttsModel,
                        )
                    }
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
            launch {
                messageSocketManager.liveLocationStarted.collect { event ->
                    if (event.conversationId != conversationId) return@collect
                    _state.update {
                        it.copy(liveLocations = LiveLocationEventFold.started(it.liveLocations, event, clock.nowMillis()))
                    }
                }
            }
            launch {
                messageSocketManager.liveLocationUpdated.collect { event ->
                    if (event.conversationId != conversationId) return@collect
                    _state.update {
                        it.copy(liveLocations = LiveLocationEventFold.updated(it.liveLocations, event, clock.nowMillis()))
                    }
                }
            }
            launch {
                messageSocketManager.liveLocationStopped.collect { event ->
                    if (event.conversationId != conversationId) return@collect
                    _state.update {
                        it.copy(liveLocations = LiveLocationEventFold.stopped(it.liveLocations, event))
                    }
                }
            }
        }

        controllers.attachAll(ChatScreenHost(conversationId, viewModelScope, screenState, latestMessages))
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
     * Overlays live `user:status`/`presence:snapshot` frames into
     * [ChatUiState.presenceByUserId] — feeds the chat header's presence dot
     * ([ChatUiState.headerPresence]). Mirrors [ConversationListViewModel]'s identically-named
     * function; started eagerly (not lazily on first header render) since
     * [MessageSocketManager]'s flows are hot `SharedFlow`s with no replay.
     */
    private fun observePresence() {
        viewModelScope.launch {
            messageSocketManager.userStatus.collect { event ->
                _state.update { it.copy(presenceByUserId = it.presenceByUserId + (event.userId to event)) }
            }
        }
        viewModelScope.launch {
            typingPresenceRelay.forcedOnline.collect { event ->
                _state.update { it.copy(presenceByUserId = it.presenceByUserId + (event.userId to event)) }
            }
        }
        viewModelScope.launch {
            messageSocketManager.presenceSnapshot.collect { snapshot ->
                _state.update {
                    it.copy(presenceByUserId = it.presenceByUserId + snapshot.users.associateBy { u -> u.userId })
                }
            }
        }
    }

    /**
     * Re-probe the server for a still-active call in this conversation. Called
     * on init and by the screen when it resumes (returning from the call, an
     * app relaunch) so the « Rejoindre » pill reflects the server truth: it
     * appears when a call the local session lost is still live, and clears once
     * the call is over. The probe never breaks the screen — a failure degrades
     * to `null` (see [ActiveCallRepository]).
     */
    fun refreshActiveCall() {
        viewModelScope.launch {
            val active = activeCallRepository.activeCallFor(conversationId)
            _state.update { it.copy(activeCall = active) }
        }
    }

    private fun removeTypingUser(userId: String) {
        _state.update { s -> s.copy(typingParticipants = TypingParticipants.stopped(s.typingParticipants, userId)) }
    }

    override fun onCleared() {
        composer.release()
        controllers.detachAll()
        super.onCleared()
    }

    // --- Composer -----------------------------------------------------------------------

    fun onDraftChange(value: String) = composer.onDraftChange(value)

    /** Discards a captured large-paste attachment (the preview chip's remove button). */
    fun removeClipboardContent() = composer.removeClipboardContent()

    /** Overrides the composer's source language from the language picker. */
    fun onComposerLanguagePicked(code: String) = composer.onComposerLanguagePicked(code)

    /** Insert the picked candidate's handle into the draft and dismiss the suggestion panel. */
    fun onMentionSelected(candidate: MentionCandidate) = composer.onMentionSelected(candidate)

    fun send() = composer.send()

    /** Sends a file picked from the system document/photo picker through the durable upload chain. */
    fun sendFileAttachment(bytes: ByteArray, fileName: String, declaredMimeType: String?) =
        composer.sendFileAttachment(bytes, fileName, declaredMimeType)

    /** Un fichier choisi, une photo ou un vocal rejoint le plateau : rien ne part avant [send]. */
    fun onPickFile(bytes: ByteArray, fileName: String, declaredMimeType: String?) =
        controllers.find<ComposerTrayController>()?.stageBytes(bytes, fileName, declaredMimeType)

    /** Present the composer's message-effects picker sheet. */
    fun openEffectsPicker() = composer.openEffectsPicker()

    /** Dismiss the effects picker; the armed effects survive until a send clears them. */
    fun dismissEffectsPicker() = composer.dismissEffectsPicker()

    /** Flip an effect chip in the armed selection. */
    fun toggleEffect(flag: Long) = composer.toggleEffect(flag)

    /** Record the chosen ephemeral self-destruct [duration] on the armed selection. */
    fun selectEphemeralDuration(duration: EphemeralDuration) = composer.selectEphemeralDuration(duration)

    /** The picker's "clear all" — reset the armed selection to no effects. */
    fun clearEffects() = composer.clearEffects()

    fun startEdit(messageId: String) = composer.startEdit(messageId)

    fun startReply(messageId: String) = composer.startReply(messageId)

    fun cancelReply() = composer.cancelReply()

    fun cancelEdit() = composer.cancelEdit()

    // --- Reactions ----------------------------------------------------------------------

    fun onMessageLongPress(messageId: String) {
        _state.update { it.copy(actionMessageId = messageId) }
        reactions.refreshOwnReactions(messageId)
    }

    fun dismissMessageActions() {
        _state.update { it.copy(actionMessageId = null) }
    }

    fun openEmojiPicker(messageId: String) = reactions.openEmojiPicker(messageId)

    fun dismissEmojiPicker() = reactions.dismissEmojiPicker()

    /** Optimistically adds (or removes) [emoji] on [messageId]; see [ChatReactionController.toggle]. */
    fun toggleReaction(messageId: String, emoji: String) = reactions.toggle(messageId, emoji)

    /** Open the who-reacted sheet for [messageId]. */
    fun openReactionDetails(messageId: String) = reactions.openDetails(messageId)

    /** Select a tab in the open who-reacted sheet; an out-of-range index is inert. */
    fun selectReactionTab(index: Int) = reactions.selectTab(index)

    /** Dismiss the who-reacted sheet. */
    fun closeReactionDetails() = reactions.closeDetails()

    // --- Prisme (translation gestures) ---------------------------------------------------

    fun toggleShowOriginal(messageId: String) = translation.toggleShowOriginal(messageId)

    /** Tap on a Prisme language-flag chip: switch the bubble's displayed language, or revert. */
    fun onFlagTap(messageId: String, code: String) = translation.onFlagTap(messageId, code)

    /** Open the per-message language explorer (long-press → "Explore languages"). */
    fun openLanguageExplorer(messageId: String) = translation.openLanguageExplorer(messageId)

    fun dismissLanguageExplorer() = translation.dismissLanguageExplorer()

    /** Retranslate a language from the explorer — force a fresh translation. */
    fun onExplorerRetranslate(messageId: String, code: String) =
        translation.onExplorerRetranslate(messageId, code)

    // --- Reply jump, pins ----------------------------------------------------------------

    /** A quoted-reply preview was tapped: scroll to the loaded original, inert otherwise. */
    fun onReplyPreviewTap(messageId: String) = replyJump.onReplyPreviewTap(messageId)

    /** The reply-count pill was tapped: scroll to the first reply of its thread. */
    fun onReplyCountTap(messageId: String) = replyJump.onReplyCountTap(messageId)

    /** Long-press on the reply-count pill: open the focused reply-thread overlay. */
    fun openReplyThread(messageId: String) = replyJump.openReplyThread(messageId)

    /** Dismisses the reply-thread overlay. */
    fun closeReplyThread() = replyJump.closeReplyThread()

    /** A reply row in the thread overlay was tapped: scroll to it and close the overlay. */
    fun onReplyThreadReplyTap(messageId: String) = replyJump.onReplyThreadReplyTap(messageId)

    /** The pinned-message banner was tapped: scroll to the newest pinned message. */
    fun onPinnedBannerTap() = replyJump.onPinnedBannerTap()

    /** Opens the full pinned-messages sheet; inert when nothing is pinned. */
    fun openPinnedSheet() = replyJump.openPinnedSheet()

    /** Dismisses the pinned-messages sheet. */
    fun closePinnedSheet() = replyJump.closePinnedSheet()

    /** A row in the pinned-messages sheet was tapped: scroll to that message and close the sheet. */
    fun onPinnedMessageTap(messageId: String) = replyJump.onPinnedMessageTap(messageId)

    /** The pending reply-jump scroll has been performed by the screen. */
    fun onScrollHandled() = replyJump.onScrollHandled()

    // --- Media, files ---------------------------------------------------------------------

    fun openImageViewer(messageId: String, imageIndex: Int) {
        val gallery = ConversationMediaGallery.of(_state.value.messages, messageId, imageIndex)
        _state.update { it.copy(imageViewer = gallery.takeUnless(ConversationGallery::isEmpty)) }
    }

    fun dismissImageViewer() {
        _state.update { it.copy(imageViewer = null) }
    }

    /** "Ouvrir" on a FILE attachment (document/code/archive) — downloads it (if not
     * already local) and, once [FileAttachmentDownloadState.Completed], the caller
     * (the Compose screen, which owns a `Context`) fires `ACTION_VIEW`. [attachmentId]
     * identifies the tapped row when a message carries several file attachments (the
     * bubble passes the id of the row that was actually tapped); `null` (the message
     * actions sheet, which has no single row) falls back to the first file. */
    fun onFileAttachmentOpen(messageId: String, attachmentId: String? = null) =
        fileDownload.open(messageId, attachmentId)

    /** "Partager" on a FILE attachment — same download, but the caller hands the
     * completed file to a share sheet instead of opening it. */
    fun onFileAttachmentShare(messageId: String, attachmentId: String? = null) =
        fileDownload.share(messageId, attachmentId)

    fun dismissFileDownload() = fileDownload.dismiss()

    // --- Forward --------------------------------------------------------------------------

    /** Open the forward-picker sheet for [messageId], closing the long-press action sheet. */
    fun openForward(messageId: String) = forward.open(messageId)

    fun onForwardQueryChange(query: String) = forward.onQueryChange(query)

    fun closeForward() = forward.close()

    /** Optimistically forward the source message into [targetConversationId]; one at a time. */
    fun forwardTo(targetConversationId: String) = forward.forwardTo(targetConversationId)

    // --- Search ---------------------------------------------------------------------------

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

    // --- Report ---------------------------------------------------------------------------

    /**
     * Open the report-a-message sheet for [messageId] (long-press → "Report"), closing the action
     * sheet first so a single sheet is on screen. Only offered for others' messages by the pure
     * [MessageActionMenu], so no self-report reaches here.
     */
    fun openReport(messageId: String) {
        _state.update { it.copy(reportForm = ReportMessageForm(messageId = messageId), actionMessageId = null) }
    }

    fun selectReportReason(reason: ReportReason) {
        _state.update { it.copy(reportForm = it.reportForm?.withReason(reason)) }
    }

    fun onReportDetailsChange(value: String) {
        _state.update { it.copy(reportForm = it.reportForm?.withDetails(value)) }
    }

    /**
     * File the report. A submission in flight or already succeeded short-circuits a re-tap
     * ([ReportMessageForm.canSubmit]), so a double tap never fires two reports. An inert repository
     * result (no session) or a network failure both surface [ReportMessageForm.hasError] and clear
     * the submitting flag, so the user can retry.
     */
    fun submitReport() {
        val form = _state.value.reportForm ?: return
        if (!form.canSubmit) return
        _state.update { it.copy(reportForm = it.reportForm?.submitting()) }
        viewModelScope.launch {
            val result = reportRepository.reportMessage(form.messageId, form.selectedReason, form.details)
            _state.update { current ->
                val open = current.reportForm ?: return@update current
                current.copy(reportForm = if (result is NetworkResult.Success) open.submitted() else open.failed())
            }
        }
    }

    fun dismissReport() {
        _state.update { it.copy(reportForm = null) }
    }

    // --- Message actions, paging ----------------------------------------------------------

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

        /** Optional deep-link query arg (`?draft=...`) — see [initialDraft]. */
        const val DRAFT_ARG: String = "draft"
        private const val TYPING_TIMEOUT_MS = 5_000L
    }
}
