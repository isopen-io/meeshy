package me.meeshy.app.chat

import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.net.toUri
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
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
        var settled = false
        try {
            while (!settled) {
                val next = queryOnce(downloadId, mimeType)
                emit(next)
                settled = next is FileAttachmentDownloadState.Completed || next is FileAttachmentDownloadState.Failed
                if (!settled) delay(POLL_INTERVAL_MS)
            }
        } finally {
            // Annuler la collecte (« Annuler le téléchargement », #13492) retire aussi la requête du système : sans cela
            // il finirait seul, écrirait le fichier et posterait sa notification de fin, titrée du nom du fichier.
            if (!settled) runCatching { downloadManager.remove(downloadId) }
        }
    }

    /** Ouvre le flux d'une pièce (remplacé par les témoins). */
    internal var openStream: (String) -> InputStream = { url ->
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = IO_TIMEOUT_MS
            readTimeout = IO_TIMEOUT_MS
            instanceFollowRedirects = true
        }.inputStream
    }

    /**
     * **« Enregistrer » pour de vrai** (#13494) : la pièce atterrit dans les Téléchargements PUBLICS, sous un nom nettoyé
     * et libre de collision, et seul un fichier réellement écrit termine en [FileAttachmentDownloadState.Completed].
     * Dès l'API 29, `MediaStore.Downloads` (aucune permission) ; en 26–28, le dossier public par le
     * `DownloadManager` (l'appelant a obtenu `WRITE_EXTERNAL_STORAGE` au geste). Toute impossibilité est un
     * [FileAttachmentDownloadFailure.SaveFailed] — jamais un succès annoncé.
     */
    fun save(url: String, fileName: String, mimeType: String): Flow<FileAttachmentDownloadState> =
        when (PublicDownloadsRoute.of(Build.VERSION.SDK_INT)) {
            PublicDownloadsRoute.SCOPED -> saveScoped(url, PublicDownloadName.safe(fileName, mimeType), mimeType)
            PublicDownloadsRoute.LEGACY -> saveLegacy(url, PublicDownloadName.safe(fileName, mimeType), mimeType)
        }

    private fun saveLegacy(url: String, name: String, mimeType: String): Flow<FileAttachmentDownloadState> = flow {
        emit(FileAttachmentDownloadState.InProgress(progressPercent = null))
        val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val target = runCatching {
            downloads.mkdirs()
            PublicDownloadName.unique(name) { File(downloads, it).exists() }
        }.getOrNull()
        val downloadId = target?.let {
            runCatching {
                val request = DownloadManager.Request(url.toUri())
                    .setTitle(it)
                    .setMimeType(mimeType)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_ONLY_COMPLETION)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, it)
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true)
                downloadManager.enqueue(request)
            }.getOrNull()
        }
        if (downloadId == null) {
            emit(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.SaveFailed))
            return@flow
        }
        var settled = false
        try {
            while (!settled) {
                val next = queryOnce(downloadId, mimeType)
                emit(next)
                settled = next is FileAttachmentDownloadState.Completed || next is FileAttachmentDownloadState.Failed
                if (!settled) delay(POLL_INTERVAL_MS)
            }
        } finally {
            if (!settled) runCatching { downloadManager.remove(downloadId) }
        }
    }

    private fun saveScoped(url: String, name: String, mimeType: String): Flow<FileAttachmentDownloadState> = flow {
        emit(FileAttachmentDownloadState.InProgress(progressPercent = null))
        val resolver = context.contentResolver
        val pending = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val item = runCatching { resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, pending) }.getOrNull()
        if (item == null) {
            emit(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.SaveFailed))
            return@flow
        }
        var written = false
        try {
            val output = checkNotNull(resolver.openOutputStream(item)) { "stream" }
            output.use { sink ->
                openStream(url).use { source ->
                    val buffer = ByteArray(COPY_BUFFER_BYTES)
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val read = source.read(buffer)
                        if (read < 0) break
                        sink.write(buffer, 0, read)
                    }
                }
            }
            resolver.update(item, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            written = true
        } catch (t: kotlinx.coroutines.CancellationException) {
            throw t
        } catch (t: Throwable) {
            emit(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.SaveFailed))
        } finally {
            if (!written) runCatching { resolver.delete(item, null, null) }
        }
        if (written) emit(FileAttachmentDownloadState.Completed(localUri = item.toString(), mimeType = mimeType))
    }.flowOn(Dispatchers.IO)

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
        const val IO_TIMEOUT_MS = 15_000
        const val COPY_BUFFER_BYTES = 16 * 1024
    }
}
