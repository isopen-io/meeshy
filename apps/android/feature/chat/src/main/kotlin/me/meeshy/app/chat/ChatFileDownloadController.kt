package me.meeshy.app.chat

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MimeTypeResolver
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.util.resolveMediaUrl

/**
 * "Ouvrir" / "Partager" on a FILE attachment (document, code, archive): tap → download →
 * hand the local file to `ACTION_VIEW` or a share sheet. One active download at a time,
 * surfaced as [ChatUiState.fileDownload]; a file already downloaded this session is served
 * straight from memory instead of re-enqueueing a system `DownloadManager` transfer.
 */
internal class ChatFileDownloadController(
    private val scope: CoroutineScope,
    private val state: ChatStateAccess,
    private val messages: StateFlow<List<LocalMessage>>,
    private val downloader: FileAttachmentDownloader,
    private val config: MeeshyConfig,
) {

    private var downloadJob: Job? = null

    /**
     * Attachments already downloaded this session, by [ApiMessageAttachment.id] — a completed
     * transfer's terminal [FileAttachmentDownloadState.Completed] (the reusable `localUri`).
     */
    private val completedDownloads = mutableMapOf<String, FileAttachmentDownloadState.Completed>()

    /** "Ouvrir": download (if not already local) then open; see [start]. */
    fun open(messageId: String, attachmentId: String?) {
        start(messageId, attachmentId, openWhenDone = true)
    }

    /** "Partager": same download, handed to a share sheet instead of opened. */
    fun share(messageId: String, attachmentId: String?) {
        start(messageId, attachmentId, openWhenDone = false)
    }

    fun dismiss() {
        downloadJob?.cancel()
        downloadJob = null
        state.update { it.copy(fileDownload = null) }
    }

    private fun start(messageId: String, attachmentId: String?, openWhenDone: Boolean) {
        val attachment = firstFileAttachment(messageId, attachmentId)
        val fileUrl = attachment?.fileUrl
        val fileName = attachment?.originalName ?: attachment?.fileName ?: messageId
        if (attachment == null || fileUrl.isNullOrBlank()) {
            state.update {
                it.copy(
                    fileDownload = FileAttachmentDownloadUiState(
                        messageId = messageId,
                        attachmentId = attachment?.id.orEmpty(),
                        fileName = fileName,
                        state = FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.NotAvailable),
                        openWhenDone = openWhenDone,
                    ),
                )
            }
            return
        }
        downloadJob?.cancel()

        val alreadyLocal = completedDownloads[attachment.id]
        if (alreadyLocal != null) {
            state.update {
                it.copy(
                    fileDownload = FileAttachmentDownloadUiState(
                        messageId = messageId,
                        attachmentId = attachment.id,
                        fileName = fileName,
                        state = alreadyLocal,
                        openWhenDone = openWhenDone,
                    ),
                )
            }
            return
        }

        val resolvedUrl = resolveMediaUrl(fileUrl, config.apiBaseUrl)
        val mimeType = MimeTypeResolver.resolve(attachment.mimeType, fileName)
        state.update {
            it.copy(
                fileDownload = FileAttachmentDownloadUiState(
                    messageId = messageId,
                    attachmentId = attachment.id,
                    fileName = fileName,
                    state = FileAttachmentDownloadState.InProgress(progressPercent = null),
                    openWhenDone = openWhenDone,
                ),
            )
        }
        downloadJob = scope.launch {
            downloader.download(resolvedUrl, fileName, mimeType).collect { downloadState ->
                if (downloadState is FileAttachmentDownloadState.Completed) {
                    completedDownloads[attachment.id] = downloadState
                }
                state.update { current ->
                    val active = current.fileDownload
                    if (active == null || active.attachmentId != attachment.id) current
                    else current.copy(fileDownload = active.copy(state = downloadState))
                }
            }
        }
    }

    /**
     * Resolves the FILE attachment to act on for [messageId]: when [attachmentId] names
     * one (the row the viewer actually tapped in the bubble), it wins outright; `null`
     * (the message actions sheet, which has no single row) falls back to the first
     * non-image/location/audio attachment, preserving the sheet's existing behaviour.
     */
    private fun firstFileAttachment(messageId: String, attachmentId: String?): ApiMessageAttachment? {
        val attachments = messages.value.firstOrNull { it.message.id == messageId }
            ?.message?.attachments
            ?: return null
        if (attachmentId != null) {
            return attachments.firstOrNull { it.id == attachmentId }
        }
        return attachments.firstOrNull { !it.isImage && !it.isLocation && !it.isAudio }
    }

    private val ApiMessageAttachment.isImage: Boolean get() = mimeType?.startsWith("image/") == true
    private val ApiMessageAttachment.isAudio: Boolean get() = mimeType?.startsWith("audio/") == true
    private val ApiMessageAttachment.isLocation: Boolean get() = mimeType == "application/x-location"
}
