package me.meeshy.app.chat

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update as updateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MimeTypeResolver
import me.meeshy.sdk.model.mediahub.MediaHubRowExit
import me.meeshy.sdk.model.piece.PieceSealing
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

    private val _downloadedIds = MutableStateFlow<Set<String>>(emptySet())

    /** Les pièces-fichiers déjà reçues pendant la session : leur rangée dit « prêt » (#13492). */
    val downloadedIds: StateFlow<Set<String>> = _downloadedIds

    /**
     * Attachments already downloaded this session, by [ApiMessageAttachment.id] — a completed
     * transfer's terminal [FileAttachmentDownloadState.Completed] (the reusable `localUri`).
     */
    private val completedDownloads = mutableMapOf<String, FileAttachmentDownloadState.Completed>()

    /** Les pièces ENREGISTRÉES dans les Téléchargements cette session : un fichier du cache d'ouverture n'est pas un fichier enregistré. */
    private val savedDownloads = mutableMapOf<String, FileAttachmentDownloadState.Completed>()

    /**
     * Les pièces d'un porteur que le fil n'a pas chargé (le hub « Médias, liens et documents » remonte tout
     * l'historique) : elles entrent par le MÊME circuit, qui les retrouve ici par leur identifiant — y compris au
     * « Réessayer » de l'overlay.
     */
    private val provided = mutableMapOf<String, ApiMessageAttachment>()

    /** "Ouvrir" une pièce que le hub fournit : même téléchargement, même overlay, même ouverture que le fil. */
    fun openProvided(messageId: String, attachment: ApiMessageAttachment) {
        provided[attachment.id] = attachment
        start(messageId, attachment.id, openWhenDone = true)
    }

    /** "Ouvrir": download (if not already local) then open; see [start]. */
    fun open(messageId: String, attachmentId: String?) {
        start(messageId, attachmentId, openWhenDone = true)
    }

    /**
     * Le toucher d'une RANGÉE du fil (#13492, miroir du badge d'iOS) : sur la pièce qui se télécharge il l'annule ; sur
     * toute autre (à télécharger, prête, en échec) il télécharge puis ouvre dans l'app.
     */
    fun tap(messageId: String, attachmentId: String?) {
        val active = state.value.fileDownload
        if (attachmentId != null && active?.attachmentId == attachmentId && active.state is FileAttachmentDownloadState.InProgress) {
            dismiss()
            return
        }
        start(messageId, attachmentId, openWhenDone = true)
    }

    /** « Enregistrer » une pièce (#13494) : même circuit, même loi de sortie ; elle n'est ni ouverte ni partagée. */
    fun save(messageId: String, attachmentId: String?) {
        start(messageId, attachmentId, openWhenDone = false, saveOnly = true)
    }

    /** "Partager": same download, handed to a share sheet instead of opened. */
    fun share(messageId: String, attachmentId: String?) {
        start(messageId, attachmentId, openWhenDone = false)
    }

    /**
     * « Réessayer » le transfert en échec : il reprend ce qu'on avait demandé — ouvrir, partager ou ENREGISTRER (#13494).
     * Un « Enregistrer » qui échoue ne se retente jamais en partage : la pièce ne part pas vers une autre application.
     */
    fun retry() {
        val failed = state.value.fileDownload ?: return
        val attachmentId = failed.attachmentId.takeIf { it.isNotBlank() }
        start(failed.messageId, attachmentId, openWhenDone = failed.openWhenDone && !failed.saveOnly, saveOnly = failed.saveOnly)
    }

    fun dismiss() {
        downloadJob?.cancel()
        downloadJob = null
        state.update { it.copy(fileDownload = null) }
    }

    private fun start(messageId: String, attachmentId: String?, openWhenDone: Boolean, saveOnly: Boolean = false) {
        val attachment = firstFileAttachment(messageId, attachmentId)
        val fileUrl = attachment?.fileUrl
        val fileName = attachment?.originalName ?: attachment?.fileName ?: messageId
        // Un contenu qui disparaît ne sort pas de Meeshy (#9573) : ni ouvert, ni enregistré, ni partagé. Une pièce
        // scellée (chiffrée, blob e2ee, message scellé) ou d'une conversation chiffrée dont l'information manque est
        // retenue par la MÊME règle que la bulle (#13493) : échec fermé.
        val carrier = messages.value.firstOrNull { it.message.id == messageId }?.message
        val withheld = PieceSealing.withholds(attachment, carrier, state.value.isEndToEnd) ||
            (carrier != null && !MediaHubRowExit.of(carrier, state.value.isEndToEnd).mayLeave)
        if (withheld) {
            downloadJob?.cancel()
            fail(messageId, attachment?.id.orEmpty(), fileName, FileAttachmentDownloadFailure.Protected, openWhenDone, saveOnly)
            return
        }
        if (attachment == null || fileUrl.isNullOrBlank()) {
            fail(messageId, attachment?.id.orEmpty(), fileName, FileAttachmentDownloadFailure.NotAvailable, openWhenDone, saveOnly)
            return
        }
        downloadJob?.cancel()

        val alreadyLocal = if (saveOnly) savedDownloads[attachment.id] else completedDownloads[attachment.id]
        if (alreadyLocal != null) {
            state.update {
                it.copy(
                    fileDownload = FileAttachmentDownloadUiState(
                        messageId = messageId,
                        attachmentId = attachment.id,
                        fileName = fileName,
                        state = alreadyLocal,
                        openWhenDone = openWhenDone,
                        saveOnly = saveOnly,
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
                    saveOnly = saveOnly,
                ),
            )
        }
        downloadJob = scope.launch {
            val transfer = if (saveOnly) downloader.save(resolvedUrl, fileName, mimeType) else downloader.download(resolvedUrl, fileName, mimeType)
            transfer.collect { downloadState ->
                if (downloadState is FileAttachmentDownloadState.Completed) {
                    if (saveOnly) {
                        savedDownloads[attachment.id] = downloadState
                    } else {
                        completedDownloads[attachment.id] = downloadState
                        _downloadedIds.updateFlow { it + attachment.id }
                    }
                }
                state.update { current ->
                    val active = current.fileDownload
                    if (active == null || active.attachmentId != attachment.id) current
                    else current.copy(fileDownload = active.copy(state = downloadState))
                }
            }
        }
    }

    private fun fail(
        messageId: String,
        attachmentId: String,
        fileName: String,
        reason: FileAttachmentDownloadFailure,
        openWhenDone: Boolean,
        saveOnly: Boolean = false,
    ) {
        state.update {
            it.copy(
                fileDownload = FileAttachmentDownloadUiState(
                    messageId = messageId,
                    attachmentId = attachmentId,
                    fileName = fileName,
                    state = FileAttachmentDownloadState.Failed(reason),
                    openWhenDone = openWhenDone,
                    saveOnly = saveOnly,
                ),
            )
        }
    }

    /**
     * Resolves the FILE attachment to act on for [messageId]: when [attachmentId] names
     * one (the row the viewer actually tapped in the bubble), it wins outright; `null`
     * (the message actions sheet, which has no single row) falls back to the first
     * non-image/location/audio attachment, preserving the sheet's existing behaviour.
     */
    private fun firstFileAttachment(messageId: String, attachmentId: String?): ApiMessageAttachment? {
        val attachments = messages.value.firstOrNull { it.message.id == messageId }?.message?.attachments
            ?: return attachmentId?.let(provided::get)
        if (attachmentId != null) return attachments.firstOrNull { it.id == attachmentId } ?: provided[attachmentId]
        return attachments.firstOrNull { !it.isImage && !it.isLocation && !it.isAudio }
    }

    private val ApiMessageAttachment.isImage: Boolean get() = mimeType?.startsWith("image/") == true
    private val ApiMessageAttachment.isAudio: Boolean get() = mimeType?.startsWith("audio/") == true
    private val ApiMessageAttachment.isLocation: Boolean get() = mimeType == "application/x-location"
}
