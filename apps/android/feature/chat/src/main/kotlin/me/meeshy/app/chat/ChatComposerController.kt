package me.meeshy.app.chat

import androidx.work.WorkManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.composer.ComposerSendGate
import me.meeshy.sdk.composer.ComposerSendKind
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.ComposeLanguageDetector
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.mention.MentionComposer
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.mention.applyRemote
import me.meeshy.sdk.mention.onTextChange
import me.meeshy.sdk.mention.reset
import me.meeshy.sdk.mention.select
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentMessageType
import me.meeshy.sdk.model.ComposerLanguageState
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.MessageEditability
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageEffectsEditor
import me.meeshy.sdk.model.MimeTypeResolver
import me.meeshy.sdk.model.isWorthPersisting
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.AnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * The composer of the conversation screen: the draft and its durable autosave, the
 * `@mention` autocomplete, the large-paste capture, the source-language pill, the armed
 * message effects, the reply/edit modes, the typing emission, and the send paths (text,
 * clipboard attachment, picked file) behind one send gate.
 *
 * Everything it knows about the screen it reads from [state]; the cached message window it
 * needs for reply/edit targets arrives as [messages]. Port of iOS
 * `ConversationViewModel+Send` and `ConversationDraftManager`.
 */
internal class ChatComposerController(
    private val scope: CoroutineScope,
    private val state: ChatStateAccess,
    private val conversationId: String,
    private val messages: StateFlow<List<LocalMessage>>,
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    private val draftStore: ConversationDraftStore,
    private val mediaUploadQueue: MediaUploadQueue,
    private val mentionSearch: MentionSearch,
    private val anonymousSessionStore: AnonymousSessionStore,
    private val messageSocketManager: MessageSocketManager,
    private val workManager: WorkManager,
    private val clock: CacheClock,
    private val pendingTray: () -> ComposerTrayController? = { null },
    private val composerText: ComposerTextHolder = ComposerTextHolder(),
) {

    private var mentionRoster: List<MentionCandidate> = emptyList()
    private var isEmittingTyping = false
    private var typingReemitJob: Job? = null
    private var typingIdleJob: Job? = null
    private var lastPersistedDraft: ConversationDraft? = null
    private var draftPersistJob: Job? = null
    private var mentionSearchJob: Job? = null

    /** Replaces the roster the `@mention` panel suggests from (the conversation's participants). */
    fun updateMentionRoster(roster: List<MentionCandidate>) {
        mentionRoster = roster
    }

    /**
     * Fold the viewer's hardened send permissions into the composer state. A
     * share-link guest carries a persisted [AnonymousSessionStore] context whose
     * capabilities gate the composer; a registered member has no stored anonymous
     * session, so the permissions stay `null` and the composer keeps the full
     * posture. A store failure degrades to the full posture (never a crash).
     */
    suspend fun loadComposerPermissions() {
        val permissions = try {
            anonymousSessionStore.load()?.permissions
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        } ?: return
        state.update { it.copy(composerPermissions = permissions) }
    }

    /**
     * Restores the conversation's durable draft (text, reply target, armed effects, manual
     * language pick) into an idle composer. [DraftAutosave.restore] refuses to clobber a
     * composer that already holds text — an incoming quick-reply draft wins over the stored one.
     */
    suspend fun restoreStoredDraft() {
        val stored = draftStore.load(conversationId)
        lastPersistedDraft = stored?.takeIf { it.isWorthPersisting }
        val restored = DraftAutosave.restore(stored, composerText.text, state.value.isEditing) ?: return
        composerText.replace(restored.text)
        state.update { current ->
            current.copy(
                replyingToMessageId = restored.replyToId,
                pendingEffects = restored.effects,
                composerLanguage = restored.selectedLanguage
                    ?.let { current.composerLanguage.withManualPick(it) }
                    ?: current.composerLanguage,
            )
        }
    }

    fun onDraftChange(value: String) {
        val detection = LargePasteDetector.detect(
            previous = composerText.text,
            current = value,
            nowMillis = clock.nowMillis(),
        )
        if (detection is PasteDetection.Captured) {
            composerText.clear()
            state.update {
                it.copy(
                    clipboardContent = detection.content,
                    mention = it.mention.onTextChange("", mentionRoster),
                    composerLanguage = it.composerLanguage.onDraftChanged(""),
                )
            }
            mentionSearchJob?.cancel()
            stopTypingEmission()
            persistDraft("", state.value.replyingToMessageId)
            return
        }
        composerText.typed(value)
        state.update {
            it.copy(
                mention = it.mention.onTextChange(value, mentionRoster),
                composerLanguage = it.composerLanguage.onDraftChanged(value),
            )
        }
        maybeSearchRemoteMentions(state.value.mention.activeQuery)
        if (value.isBlank()) {
            stopTypingEmission()
        } else {
            startTypingEmission()
        }
        persistDraft(value, state.value.replyingToMessageId)
    }

    /** Discards a captured large-paste attachment (the preview chip's remove button). */
    fun removeClipboardContent() {
        state.update { it.copy(clipboardContent = null) }
    }

    /**
     * Overrides the composer's source language from the language picker. The pick
     * wins over live detection and freezes further analysis until the composer is
     * cleared on send (iOS `TextAnalyzer.setLanguageOverride`).
     */
    fun onComposerLanguagePicked(code: String) {
        state.update { it.copy(composerLanguage = it.composerLanguage.withManualPick(code)) }
        persistDraft(composerText.text, state.value.replyingToMessageId)
    }

    /**
     * Best-effort auto-save of the new-message composer to the durable
     * [draftStore] (iOS `ConversationDraftManager`). Never persists while an
     * edit is in flight — the edit content is not a draft — and skips the write
     * entirely when the store already matches ([DraftAutosave.resolve] → [DraftPersist.None]).
     * The single [draftPersistJob] coalesces rapid keystrokes to a last-write-wins.
     * [replyToId] carries the currently-armed reply so it is persisted alongside the text
     * (iOS app-side `DraftStore` reply-reference parity); the currently-armed
     * [ChatUiState.pendingEffects] are read from state and persisted too, so a self-destruct
     * duration or a confetti effect armed but not yet sent survives navigation (iOS
     * `MessageDraft.effectFlags`/`isBlurEnabled`/`ephemeralDurationRawValue` parity). The manual
     * composer-language pick ([ComposerLanguageState.manualOverride]) is likewise read from state
     * and persisted, so a deliberate language override rides along the draft (iOS
     * `MessageDraft.selectedLanguage` parity) — live detection is not persisted, it re-derives from
     * the restored text.
     */
    private fun persistDraft(rawText: String, replyToId: String?) {
        if (state.value.isEditing) return
        val decision = DraftAutosave.resolve(
            conversationId = conversationId,
            rawText = rawText,
            replyToId = replyToId,
            nowIso = java.time.Instant.ofEpochMilli(clock.nowMillis()).toString(),
            previous = lastPersistedDraft,
            effects = state.value.pendingEffects,
            selectedLanguage = state.value.composerLanguage.manualOverride,
        )
        lastPersistedDraft = when (decision) {
            is DraftPersist.Save -> decision.draft
            is DraftPersist.Clear -> null
            DraftPersist.None -> return
        }
        draftPersistJob?.cancel()
        draftPersistJob = scope.launch {
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
        mentionSearchJob?.cancel()
        val (newDraft, newMention) = state.value.mention.select(candidate, composerText.text)
        composerText.replace(newDraft)
        state.update { it.copy(mention = newMention) }
    }

    /**
     * Fires a debounced directory lookup for the active `@fragment` and folds the
     * results into the panel below the local roster. Mirrors iOS
     * `MentionComposerController`: nothing runs for a dismissed panel or a query under
     * two significant characters (the roster already covers those); a fresh keystroke
     * cancels the previous in-flight lookup (300 ms debounce). The self-exclusion and
     * local-first dedup live in the pure [MentionAutocompleteState.applyRemote] merge,
     * which also drops a slow response whose fragment is already stale.
     */
    private fun maybeSearchRemoteMentions(query: String?) {
        mentionSearchJob?.cancel()
        if (query == null || !MentionComposer.shouldQueryRemote(query)) return
        val currentUserId = sessionRepository.currentUser.value?.id
        mentionSearchJob = scope.launch {
            delay(MENTION_SEARCH_DEBOUNCE_MS)
            val remote = try {
                mentionSearch.search(query.trim())
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                return@launch
            }.filterNot { it.id == currentUserId }
            state.update { it.copy(mention = it.mention.applyRemote(query, remote)) }
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
            typingReemitJob = scope.launch {
                while (true) {
                    delay(TYPING_REEMIT_MS)
                    messageSocketManager.emitTypingStart(conversationId)
                }
            }
        }
        typingIdleJob?.cancel()
        typingIdleJob = scope.launch {
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

    /** Ends the typing emission when the screen is torn down — the peers must not see a ghost. */
    fun release() {
        stopTypingEmission()
    }

    fun send() {
        val text = composerText.text.trim()
        val clipboard = state.value.clipboardContent
        val tray = pendingTray()
        val hasStaged = tray?.state?.value?.isEmpty == false
        if (text.isEmpty() && clipboard == null && !hasStaged) return
        stopTypingEmission()
        val editingId = state.value.editingMessageId
        if (editingId != null) {
            if (text.isNotEmpty() || clipboard != null) applyEdit(editingId, text)
            return
        }
        if (hasStaged && tray?.state?.value?.hasPreparing == true) return
        // Unified send gate: refuse a new send while a slow-mode cooldown is running
        // or the viewer is read-only (edits above are exempt — they are not new
        // messages). The draft is kept so the countdown's tick simply re-enables the
        // send button.
        val sentAtMillis = clock.nowMillis()
        val gate = ComposerSendGate.evaluate(
            ComposerSendKind.TEXT,
            state.value.composerAffordances,
            state.value.slowModeState(sentAtMillis),
        )
        if (!gate.allowed) return
        if (!stagedKindsAllowed(tray, sentAtMillis)) return
        val user = sessionRepository.currentUser.value ?: return
        val replyToId = state.value.replyingToMessageId
        val effects = state.value.pendingEffects
        val batch = tray?.takeForSend()
        // The composer pill is the authoritative source language: its live detection
        // or the viewer's manual override, resolved against the user's content language.
        val languageCode = state.value.composerLanguage.display(
            fallback = LanguageResolver.resolveUserLanguage(user),
        )
        composerText.clear()
        state.update {
            it.copy(
                clipboardContent = null,
                replyingToMessageId = null,
                mention = it.mention.reset(),
                pendingEffects = MessageEffects(),
                isEffectsPickerOpen = false,
                lastSelfSentAtMillis = sentAtMillis,
                composerLanguage = ComposerLanguageState(),
            )
        }
        persistDraft("", replyToId = null)
        scope.launch {
            try {
                if (batch != null) {
                    if (clipboard != null) sendClipboardContent(text, clipboard, user, replyToId, effects)
                    sendStagedBatch(
                        tray, batch, if (clipboard != null) "" else text, languageCode, user,
                        if (clipboard != null) null else replyToId, effects,
                    )
                } else if (clipboard != null) {
                    sendClipboardContent(text, clipboard, user, replyToId, effects)
                } else {
                    messageRepository.sendOptimistic(
                        conversationId = conversationId,
                        content = text,
                        originalLanguage = languageCode,
                        sender = user,
                        replyToId = replyToId,
                        effects = effects,
                    )
                }
                workManager.enqueue(OutboxFlushWorker.buildRequest())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    /**
     * Delivers a captured large paste as a real `text/plain` attachment through the
     * durable upload→send chain: the bytes are queued for upload, the send is
     * enqueued gated on that upload and carrying its cmid as a placeholder
     * attachment id, and the drainer grafts the real gateway id in once the upload
     * lands ([me.meeshy.sdk.conversation.MessageMediaWriteBack]). Surpasses iOS,
     * which previews the clipboard chip but never sends it.
     */
    private suspend fun sendClipboardContent(
        text: String,
        clipboard: ClipboardContent,
        user: MeeshyUser,
        replyToId: String?,
        effects: MessageEffects,
    ) {
        val bytes = clipboard.text.toByteArray(Charsets.UTF_8)
        val uploadCmid = mediaUploadQueue.enqueue(
            MediaUploadItem(
                bytes = bytes,
                fileName = CLIPBOARD_ATTACHMENT_NAME,
                mimeType = CLIPBOARD_ATTACHMENT_MIME,
            ),
        )
        messageRepository.sendOptimistic(
            conversationId = conversationId,
            content = text,
            originalLanguage = ComposeLanguageDetector.detect(
                text.ifBlank { clipboard.text },
                fallback = LanguageResolver.resolveUserLanguage(user),
            ),
            sender = user,
            replyToId = replyToId,
            effects = effects,
            messageType = "file",
            attachmentUploadCmids = listOf(uploadCmid),
            attachments = listOf(
                ApiMessageAttachment(
                    id = uploadCmid,
                    fileName = CLIPBOARD_ATTACHMENT_NAME,
                    originalName = CLIPBOARD_ATTACHMENT_NAME,
                    mimeType = CLIPBOARD_ATTACHMENT_MIME,
                    fileSize = bytes.size,
                ),
            ),
        )
    }

    /** Chaque famille de pièce en attente doit être permise par la porte d'envoi unique. */
    private fun stagedKindsAllowed(tray: ComposerTrayController?, sentAtMillis: Long): Boolean {
        val items = tray?.state?.value?.items.orEmpty()
        return items.map { AttachmentMessageType.forMime(it.mimeType) }.distinct().all { type ->
            ComposerSendGate.evaluate(
                ComposerSendKind.fromMessageType(type),
                state.value.composerAffordances,
                state.value.slowModeState(sentAtMillis),
            ).allowed
        }
    }

    /**
     * Envoie le plateau en UN message : chaque fichier de travail est lu, mis en file
     * d'envoi durable (même chaîne que le presse-papiers), puis le message part avec tous
     * ses cmids. Un fichier de travail disparu est signalé et ne fait pas partir de pièce vide.
     */
    private suspend fun sendStagedBatch(
        tray: ComposerTrayController?,
        batch: StagedBatch,
        text: String,
        languageCode: String,
        user: MeeshyUser,
        replyToId: String?,
        effects: MessageEffects,
    ) {
        if (tray == null) return
        val uploaded = batch.items.mapNotNull { item ->
            val bytes = tray.readBytes(item) ?: return@mapNotNull null
            val name = item.fileName?.trim()?.ifBlank { null } ?: DEFAULT_ATTACHMENT_NAME
            val mime = MimeTypeResolver.resolve(item.mimeType, name)
            val cmid = mediaUploadQueue.enqueue(MediaUploadItem(bytes = bytes, fileName = name, mimeType = mime))
            cmid to ApiMessageAttachment(
                id = cmid,
                fileName = name,
                originalName = name,
                mimeType = mime,
                fileSize = bytes.size,
            )
        }
        tray.release(batch)
        if (uploaded.isEmpty()) {
            check(text.isNotBlank()) { "attachment unavailable" }
            messageRepository.sendOptimistic(
                conversationId = conversationId,
                content = text,
                originalLanguage = languageCode,
                sender = user,
                replyToId = replyToId,
                effects = effects,
            )
            return
        }
        val types = uploaded.map { AttachmentMessageType.forMime(it.second.mimeType) }.distinct()
        messageRepository.sendOptimistic(
            conversationId = conversationId,
            content = text,
            originalLanguage = languageCode,
            sender = user,
            replyToId = replyToId,
            effects = effects,
            messageType = types.singleOrNull() ?: AttachmentMessageType.FILE,
            attachmentUploadCmids = uploaded.map { it.first },
            attachments = uploaded.map { it.second },
        )
    }

    /**
     * Sends a file picked from the system document/photo picker through the same
     * durable upload→graft→send chain the clipboard path already uses: the bytes
     * are queued for upload, the send is enqueued gated on that upload and carrying
     * its cmid as a placeholder attachment id, and the drainer grafts the real
     * gateway id in once the upload lands. The message's coarse `messageType`
     * (image/video/audio/file) is inferred from the resolved MIME via
     * [AttachmentMessageType]; any text already in the composer rides along as the
     * body and is cleared, mirroring [sendClipboardContent].
     *
     * A blank pick ([bytes] empty) or a signed-out session is inert. Note: audio
     * picked here is delivered over REST like any other file — the socket audio
     * pipeline (transcription/translation) is a separate slice; this path never
     * triggers it.
     */
    fun sendFileAttachment(bytes: ByteArray, fileName: String, declaredMimeType: String?) {
        if (bytes.isEmpty()) return
        val user = sessionRepository.currentUser.value ?: return
        val safeName = fileName.trim().ifBlank { DEFAULT_ATTACHMENT_NAME }
        val mime = MimeTypeResolver.resolve(declaredMimeType, safeName)
        val messageType = AttachmentMessageType.forMime(mime)
        // Same unified gate the text path uses: a denied attachment capability or a
        // running slow-mode cooldown refuses the pick before it leaves the composer.
        // The "+" ladder stays visible during a cooldown, so this is where the block
        // is really enforced — and a delivered attachment starts the cooldown too.
        val sentAtMillis = clock.nowMillis()
        val gate = ComposerSendGate.evaluate(
            ComposerSendKind.fromMessageType(messageType),
            state.value.composerAffordances,
            state.value.slowModeState(sentAtMillis),
        )
        if (!gate.allowed) return
        val text = composerText.text.trim()
        val replyToId = state.value.replyingToMessageId
        val effects = state.value.pendingEffects
        val languageCode = state.value.composerLanguage.display(
            fallback = LanguageResolver.resolveUserLanguage(user),
        )
        stopTypingEmission()
        composerText.clear()
        state.update {
            it.copy(
                replyingToMessageId = null,
                mention = it.mention.reset(),
                pendingEffects = MessageEffects(),
                isEffectsPickerOpen = false,
                lastSelfSentAtMillis = sentAtMillis,
                composerLanguage = ComposerLanguageState(),
            )
        }
        persistDraft("", replyToId = null)
        scope.launch {
            try {
                val uploadCmid = mediaUploadQueue.enqueue(
                    MediaUploadItem(bytes = bytes, fileName = safeName, mimeType = mime),
                )
                messageRepository.sendOptimistic(
                    conversationId = conversationId,
                    content = text,
                    originalLanguage = languageCode,
                    sender = user,
                    replyToId = replyToId,
                    effects = effects,
                    messageType = messageType,
                    attachmentUploadCmids = listOf(uploadCmid),
                    attachments = listOf(
                        ApiMessageAttachment(
                            id = uploadCmid,
                            fileName = safeName,
                            originalName = safeName,
                            mimeType = mime,
                            fileSize = bytes.size,
                        ),
                    ),
                )
                workManager.enqueue(OutboxFlushWorker.buildRequest())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    /** Present the composer's message-effects picker sheet. */
    fun openEffectsPicker() {
        state.update { it.copy(isEffectsPickerOpen = true) }
    }

    /** Dismiss the effects picker; the armed [ChatUiState.pendingEffects] survive
     * so a reopened sheet shows the same selection (only a send clears it). */
    fun dismissEffectsPicker() {
        state.update { it.copy(isEffectsPickerOpen = false) }
    }

    /**
     * Flip an effect chip in the armed selection via the pure [MessageEffectsEditor].
     * Toggling an already-armed effect off leaves every other bit untouched. The armed
     * effects are persisted alongside the draft so a selection survives navigation, and
     * un-arming the last effect on an empty composer purges the stored draft.
     */
    fun toggleEffect(flag: Long) {
        state.update { it.copy(pendingEffects = MessageEffectsEditor.toggle(it.pendingEffects, flag)) }
        persistDraft(composerText.text, state.value.replyingToMessageId)
    }

    /** Record the chosen ephemeral self-destruct [duration] on the armed selection. */
    fun selectEphemeralDuration(duration: EphemeralDuration) {
        state.update {
            it.copy(pendingEffects = MessageEffectsEditor.withEphemeralDuration(it.pendingEffects, duration))
        }
        persistDraft(composerText.text, state.value.replyingToMessageId)
    }

    /** The picker's "clear all" — reset the armed selection to no effects. */
    fun clearEffects() {
        state.update { it.copy(pendingEffects = MessageEffectsEditor.cleared()) }
        persistDraft(composerText.text, state.value.replyingToMessageId)
    }

    fun startEdit(messageId: String) {
        val message = messages.value.firstOrNull {
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
        composerText.replace(message.content)
        state.update {
            it.copy(
                editingMessageId = messageId,
                actionMessageId = null,
                replyingToMessageId = null,
            )
        }
    }

    fun startReply(messageId: String) {
        val message = messages.value.firstOrNull {
            it.message.id == messageId && it.sendState == LocalSendState.SYNCED
        }?.message ?: return
        if (message.deletedAt != null) return
        if (state.value.isEditing) composerText.clear()
        state.update {
            it.copy(
                replyingToMessageId = messageId,
                actionMessageId = null,
                editingMessageId = null,
            )
        }
        persistDraft(composerText.text, replyToId = messageId)
    }

    fun cancelReply() {
        state.update { it.copy(replyingToMessageId = null) }
        persistDraft(composerText.text, replyToId = null)
    }

    fun cancelEdit() {
        composerText.clear()
        state.update { it.copy(editingMessageId = null) }
    }

    private fun applyEdit(messageId: String, content: String) {
        composerText.clear()
        state.update { it.copy(editingMessageId = null) }
        scope.launch {
            try {
                if (messageRepository.editOptimistic(messageId, content)) {
                    workManager.enqueue(OutboxFlushWorker.buildRequest())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    private companion object {
        const val TYPING_REEMIT_MS = 3_000L
        const val TYPING_IDLE_MS = 3_000L
        const val MENTION_SEARCH_DEBOUNCE_MS = 300L
        const val CLIPBOARD_ATTACHMENT_NAME = "clipboard-content.txt"
        const val CLIPBOARD_ATTACHMENT_MIME = "text/plain"
        const val DEFAULT_ATTACHMENT_NAME = "attachment"
    }
}
