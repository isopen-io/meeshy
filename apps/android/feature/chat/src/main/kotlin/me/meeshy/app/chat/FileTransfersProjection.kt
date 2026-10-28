package me.meeshy.app.chat

import me.meeshy.sdk.model.piece.PieceTransfer
import me.meeshy.ui.component.bubble.BubbleFileTransfers

/**
 * Ce que les rangées de fichiers du fil lisent du téléchargement en cours (#13492) : la pièce qui se télécharge, son
 * avancement ou son échec, et les pièces déjà reçues pendant la session. Pur : l'état d'écran ne s'expose à la bulle
 * que par cette projection.
 */
internal fun bubbleFileTransfersOf(download: FileAttachmentDownloadUiState?, downloaded: Set<String>): BubbleFileTransfers {
    val transfer = when (val state = download?.state) {
        is FileAttachmentDownloadState.InProgress -> PieceTransfer.InProgress(state.progressPercent)
        is FileAttachmentDownloadState.Failed -> PieceTransfer.Failed.takeIf { state.reason.isRetryable }
        is FileAttachmentDownloadState.Completed, null -> null
    }
    return BubbleFileTransfers(
        activeAttachmentId = download?.attachmentId?.takeIf { transfer != null && it.isNotBlank() },
        active = transfer,
        readyAttachmentIds = downloaded,
    )
}

/** Un échec que la rangée propose de retenter : le réseau ou la passerelle, jamais un refus de protection ni un contenu disparu. */
private val FileAttachmentDownloadFailure.isRetryable: Boolean
    get() = this == FileAttachmentDownloadFailure.NetworkError || this == FileAttachmentDownloadFailure.ServerError
