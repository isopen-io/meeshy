package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentMessageType
import me.meeshy.sdk.model.MimeTypeResolver
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

data class ShareTargetUiState(
    val query: String = "",
    val targets: List<ForwardTarget> = emptyList(),
    val sendingConversationId: String? = null,
    val sentConversationIds: Set<String> = emptySet(),
    val isFinished: Boolean = false,
    val isSignedOut: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * Drives the "share into Meeshy" target (feature-parity §O, "Generic in-app share picker /
 * Android Share-Sheet receiver") — text/URL (lot 1) plus image/video attachments (lot 2),
 * matching iOS's own `MeeshyShareExtension` phased rollout. Reached from another app's system
 * share sheet (`ACTION_SEND`), not from within Meeshy itself, so it runs in the same
 * process/session as the rest of the app — no App Group, no separate offline relay needed:
 * [MessageRepository.sendOptimistic] already durably queues through the existing outbox on
 * failure, and a shared image/video enqueues through the same [MediaUploadQueue] the chat
 * composer's own attachment picker uses ([ChatViewModel.sendFileAttachment]) — no TUS pipeline
 * involved, message attachments never went through TUS on either platform (that pipeline is
 * post/story/status/comment media only).
 *
 * The conversation picker reuses [ForwardTargets] — the same pure SSOT [ChatViewModel] uses for
 * its forward sheet — rather than a second filtering rule. Unlike forwarding (multi-target,
 * message already exists), a share picks exactly ONE conversation and finishes: [isFinished]
 * signals the screen to close, matching the platform convention for a share-sheet receiver.
 */
@HiltViewModel
class ShareTargetViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    private val workManager: WorkManager,
    private val mediaUploadQueue: MediaUploadQueue,
) : ViewModel() {

    private val _state = MutableStateFlow(ShareTargetUiState())
    val state: StateFlow<ShareTargetUiState> = _state.asStateFlow()

    private var sharedText: String = ""
    private var sharedAttachment: MediaUploadItem? = null
    private var allConversations: List<ApiConversation> = emptyList()

    init {
        viewModelScope.launch {
            conversationRepository.conversationsStream().collect { result ->
                allConversations = result.valueOrNull ?: allConversations
                recomputeTargets()
            }
        }
    }

    /** Binds the shared text (trimmed; blank means nothing to send) — call once, right after launch. */
    fun load(text: String) {
        sharedText = text.trim()
        if (sessionRepository.currentUser.value == null) {
            _state.update { it.copy(isSignedOut = true) }
        }
    }

    /**
     * Binds a shared image/video (lot 2) — call once, right after launch, alongside [load].
     * [bytes] already read from the inbound `ACTION_SEND` content Uri; empty bytes are a no-op
     * (a stream that failed to open). Mirrors [ChatViewModel.sendFileAttachment]'s own
     * mime-resolution: a meaningful [declaredMimeType] wins, otherwise it is inferred from
     * [fileName]'s extension.
     */
    fun loadAttachment(bytes: ByteArray, fileName: String, declaredMimeType: String?) {
        if (bytes.isEmpty()) return
        val safeName = fileName.trim().ifBlank { DEFAULT_ATTACHMENT_NAME }
        sharedAttachment = MediaUploadItem(
            bytes = bytes,
            fileName = safeName,
            mimeType = MimeTypeResolver.resolve(declaredMimeType, safeName),
        )
    }

    fun onQueryChange(query: String) {
        _state.update { it.copy(query = query) }
        recomputeTargets()
    }

    /**
     * Sends the shared text and/or attachment into [conversationId] and finishes. A send already
     * in flight, an already-sent target, nothing to send (no text AND no attachment), or no
     * signed-in user are all inert — the picker never fires a doomed or duplicate request.
     */
    fun sendTo(conversationId: String) {
        if (_state.value.sendingConversationId != null) return
        if (conversationId in _state.value.sentConversationIds) return
        val attachment = sharedAttachment
        if (sharedText.isEmpty() && attachment == null) return
        val user = sessionRepository.currentUser.value ?: return

        _state.update { it.copy(sendingConversationId = conversationId, errorMessage = null) }
        viewModelScope.launch {
            try {
                if (attachment != null) {
                    val uploadCmid = mediaUploadQueue.enqueue(attachment)
                    messageRepository.sendOptimistic(
                        conversationId = conversationId,
                        content = sharedText,
                        originalLanguage = LanguageResolver.FALLBACK_LANGUAGE,
                        sender = user,
                        messageType = AttachmentMessageType.forMime(attachment.mimeType),
                        attachmentUploadCmids = listOf(uploadCmid),
                        attachments = listOf(
                            ApiMessageAttachment(
                                id = uploadCmid,
                                fileName = attachment.fileName,
                                originalName = attachment.fileName,
                                mimeType = attachment.mimeType,
                                fileSize = attachment.bytes.size,
                            ),
                        ),
                    )
                } else {
                    messageRepository.sendOptimistic(
                        conversationId = conversationId,
                        content = sharedText,
                        originalLanguage = LanguageResolver.FALLBACK_LANGUAGE,
                        sender = user,
                    )
                }
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                _state.update {
                    it.copy(
                        sendingConversationId = null,
                        sentConversationIds = it.sentConversationIds + conversationId,
                        isFinished = true,
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
                targets = ForwardTargets.of(
                    conversations = allConversations,
                    sourceConversationId = "",
                    query = it.query,
                    currentUserId = sessionRepository.currentUser.value?.id,
                ),
            )
        }
    }

    private companion object {
        const val DEFAULT_ATTACHMENT_NAME = "attachment"
    }
}
