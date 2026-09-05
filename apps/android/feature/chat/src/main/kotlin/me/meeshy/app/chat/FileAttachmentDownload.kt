package me.meeshy.app.chat

import android.app.DownloadManager

/**
 * The lifecycle of downloading one FILE attachment (document / code / archive —
 * never image/video/audio, which have their own inline players) so it can be
 * opened via `ACTION_VIEW` or handed to a share sheet. Mirrors iOS
 * `AttachmentDownloader`'s states, scoped to the non-media kinds `AttachmentDownloader`
 * doesn't cover (QuickLook opens the *downloaded* file the same way this state
 * machine leads to `Completed`).
 */
sealed interface FileAttachmentDownloadState {
    /** [progressPercent] is null while the total size isn't known yet (indeterminate). */
    data class InProgress(val progressPercent: Int?) : FileAttachmentDownloadState

    /** [localUri] is a URI the caller can hand directly to an `ACTION_VIEW`/`ACTION_SEND` intent. */
    data class Completed(val localUri: String, val mimeType: String) : FileAttachmentDownloadState

    data class Failed(val reason: FileAttachmentDownloadFailure) : FileAttachmentDownloadState
}

/**
 * What [ChatViewModel] surfaces for the file attachment currently being opened or
 * shared — one active download at a time (a second tap replaces it, matching every
 * other single-target overlay in [ChatUiState]: [ChatUiState.reactionDetails],
 * [ChatUiState.imageViewer]).
 */
data class FileAttachmentDownloadUiState(
    val messageId: String,
    val attachmentId: String,
    val fileName: String,
    val state: FileAttachmentDownloadState,
    /** True = open the file via `ACTION_VIEW` once downloaded ("Ouvrir"); false = hand it
     * to a share sheet instead ("Partager"). Decided once, at tap time. */
    val openWhenDone: Boolean,
)

enum class FileAttachmentDownloadFailure {
    /** The carrier message was recalled, expired, or the attachment's view-once burned — the
     * gateway now answers 404/410 for a request that used to succeed. */
    Expired,
    /** No network reachable, or the transfer was interrupted. */
    NetworkError,
    /** The gateway answered but not with success (5xx, or a malformed response). */
    ServerError,
    /** The attachment has no `fileUrl` yet (still uploading, or a purely local echo). */
    NotAvailable,
}

/**
 * Pure projection of a [DownloadManager] status row into a [FileAttachmentDownloadState] —
 * kept separate from [FileAttachmentDownloader] so the state machine is testable without
 * a real `DownloadManager`/`Cursor`. [status] and [reason] are the raw
 * `DownloadManager.COLUMN_STATUS`/`COLUMN_REASON` values (public static final ints, so
 * comparing against them here needs no Android runtime).
 */
object FileAttachmentDownloadProgress {

    fun fromCursorColumns(
        status: Int,
        reason: Int,
        bytesDownloaded: Long,
        bytesTotal: Long,
        localUri: String?,
        mimeType: String,
    ): FileAttachmentDownloadState = when (status) {
        DownloadManager.STATUS_SUCCESSFUL ->
            localUri?.let { FileAttachmentDownloadState.Completed(localUri = it, mimeType = mimeType) }
                ?: FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.ServerError)

        DownloadManager.STATUS_FAILED ->
            FileAttachmentDownloadState.Failed(failureForReason(reason))

        else -> FileAttachmentDownloadState.InProgress(percentOf(bytesDownloaded, bytesTotal))
    }

    /**
     * `DownloadManager.COLUMN_REASON` holds one of the `ERROR_*` constants — or, when the
     * transfer failed with an HTTP error, the raw HTTP status code (documented behavior of
     * `DownloadManager`). A 404/410 means the gateway no longer serves this attachment
     * (`carrierMessageStillServesBytes` on the gateway denies a recalled/expired message).
     */
    private fun failureForReason(reason: Int): FileAttachmentDownloadFailure = when (reason) {
        404, 410 -> FileAttachmentDownloadFailure.Expired
        DownloadManager.ERROR_CANNOT_RESUME,
        DownloadManager.ERROR_HTTP_DATA_ERROR,
        DownloadManager.ERROR_TOO_MANY_REDIRECTS,
        DownloadManager.ERROR_UNKNOWN,
        -> FileAttachmentDownloadFailure.NetworkError
        else -> FileAttachmentDownloadFailure.ServerError
    }

    private fun percentOf(bytesDownloaded: Long, bytesTotal: Long): Int? =
        if (bytesTotal > 0) ((bytesDownloaded * 100) / bytesTotal).toInt().coerceIn(0, 100) else null
}
