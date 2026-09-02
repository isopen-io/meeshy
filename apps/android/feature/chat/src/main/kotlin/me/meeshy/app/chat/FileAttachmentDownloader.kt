package me.meeshy.app.chat

import android.app.DownloadManager
import android.content.Context
import androidx.core.net.toUri
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Downloads one FILE attachment (document / code / archive) through the system
 * [DownloadManager] — background transfer, retry, and a system notification for
 * free. No destination is set on the [DownloadManager.Request] on purpose: the
 * system manages the storage itself and [DownloadManager.getUriForDownloadedFile]
 * then hands back a `content://downloads/...` Uri that is safe to grant to another
 * app via `ACTION_VIEW`/`ACTION_SEND` — no dedicated `FileProvider` entry needed.
 * A raw `file://` Uri from `setDestinationInExternalFilesDir`/`COLUMN_LOCAL_URI`
 * would throw `FileUriExposedException` the moment another app's Intent handler
 * tried to open it (StrictMode, API 24+).
 *
 * The attachment URL served by the gateway's legacy path route
 * (`GET /attachments/file/…`, `resolveMediaUrl`'s `ATTACHMENT_FILE_ROUTE`) carries
 * no auth requirement — the same route `AsyncImage`/Coil already loads bubble
 * images from and `AudioBubble`'s `onAudioClick` hands to `UriHandler.openUri` —
 * so [DownloadManager], which cannot attach a bearer token, works unmodified here.
 *
 * A thin Android-framework wrapper by design: the actual state derivation from a
 * `DownloadManager.Query` cursor is [FileAttachmentDownloadProgress], a pure
 * function this class only feeds.
 */
@Singleton
class FileAttachmentDownloader @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val downloadManager: DownloadManager
        get() = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    /**
     * Enqueues [url] for download under [fileName], polling until it settles into
     * [FileAttachmentDownloadState.Completed] or [FileAttachmentDownloadState.Failed] —
     * the terminal states after which this flow completes.
     */
    fun download(url: String, fileName: String, mimeType: String): Flow<FileAttachmentDownloadState> = flow {
        emit(FileAttachmentDownloadState.InProgress(progressPercent = null))
        val downloadId = runCatching {
            val request = DownloadManager.Request(url.toUri())
                .setTitle(fileName)
                .setMimeType(mimeType)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_ONLY_COMPLETION)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
            downloadManager.enqueue(request)
        }.getOrNull()
        if (downloadId == null) {
            emit(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.NetworkError))
            return@flow
        }
        while (true) {
            val next = queryOnce(downloadId, mimeType)
            emit(next)
            if (next is FileAttachmentDownloadState.Completed || next is FileAttachmentDownloadState.Failed) {
                return@flow
            }
            delay(POLL_INTERVAL_MS)
        }
    }

    private fun queryOnce(downloadId: Long, mimeType: String): FileAttachmentDownloadState {
        val query = DownloadManager.Query().setFilterById(downloadId)
        val (status, reason, bytesDownloaded, bytesTotal) = downloadManager.query(query).use { cursor ->
            if (!cursor.moveToFirst()) {
                return FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.ServerError)
            }
            CursorRow(
                status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)),
                reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)),
                bytesDownloaded = cursor.getLong(
                    cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR),
                ),
                bytesTotal = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)),
            )
        }
        // Only asked for on success: `getUriForDownloadedFile` is the documented safe way to
        // obtain a grantable `content://` Uri for the completed download (see class doc).
        val localUri = if (status == DownloadManager.STATUS_SUCCESSFUL) {
            runCatching { downloadManager.getUriForDownloadedFile(downloadId)?.toString() }.getOrNull()
        } else {
            null
        }
        return FileAttachmentDownloadProgress.fromCursorColumns(
            status = status,
            reason = reason,
            bytesDownloaded = bytesDownloaded,
            bytesTotal = bytesTotal,
            localUri = localUri,
            mimeType = mimeType,
        )
    }

    private data class CursorRow(val status: Int, val reason: Int, val bytesDownloaded: Long, val bytesTotal: Long)

    private companion object {
        const val POLL_INTERVAL_MS = 250L
    }
}
