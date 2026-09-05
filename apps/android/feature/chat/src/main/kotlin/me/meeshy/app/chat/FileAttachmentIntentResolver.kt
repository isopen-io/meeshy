package me.meeshy.app.chat

import android.content.Intent
import android.net.Uri
import me.meeshy.sdk.model.MimeTypeResolver

/**
 * Mime -> intent resolution for opening/sharing a downloaded FILE attachment
 * (document / code / archive). Pure and Android-native: no viewer/QuickLook
 * equivalent exists on Android, so the OS is handed the job via
 * `ACTION_VIEW`/`ACTION_SEND` and picks whatever app declares the mime type —
 * the same "let the platform decide" posture iOS takes with `QLPreviewController`
 * falling back to `UIActivityViewController` for unsupported types.
 *
 * Mime resolution itself delegates to [MimeTypeResolver] (`:core:model`) — the
 * single source of truth for extension<->mime, already the SDK's forward table —
 * rather than re-deriving a second one here.
 */
object FileAttachmentIntentResolver {

    /** The mime type to advertise for [fileName], preferring a real declared [mimeType]. */
    fun resolveMimeType(mimeType: String?, fileName: String?): String =
        MimeTypeResolver.resolve(mimeType, fileName.orEmpty())

    /**
     * `ACTION_VIEW` on [fileUri] typed as the resolved mime — the caller must grant read
     * permission on [fileUri] itself (a `content://` URI from `DownloadManager` already
     * carries it; a `FileProvider` URI needs `FLAG_GRANT_READ_URI_PERMISSION`, added here
     * defensively either way since granting it on a self-owned `content://` URI is a no-op).
     */
    fun viewIntent(fileUri: Uri, mimeType: String?, fileName: String?): Intent =
        Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(fileUri, resolveMimeType(mimeType, fileName))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

    /** A chooser over `ACTION_SEND` for [fileUri] — the "Partager" counterpart to [viewIntent]. */
    fun shareIntent(fileUri: Uri, mimeType: String?, fileName: String?): Intent {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = resolveMimeType(mimeType, fileName)
            putExtra(Intent.EXTRA_STREAM, fileUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return Intent.createChooser(send, fileName)
    }
}
