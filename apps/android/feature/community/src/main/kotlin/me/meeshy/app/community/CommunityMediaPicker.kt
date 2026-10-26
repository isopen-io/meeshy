package me.meeshy.app.community

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import me.meeshy.sdk.media.MediaUploadItem

/** Lit le contenu choisi en [MediaUploadItem] ; `null` si le flux ne s'ouvre pas. Le décodage et la compression vivent ailleurs. */
internal fun ContentResolver.readMediaUploadItem(uri: Uri): MediaUploadItem? {
    val bytes = runCatching { openInputStream(uri)?.use { it.readBytes() } }.getOrNull() ?: return null
    val name = runCatching {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (i >= 0 && c.moveToFirst()) c.getString(i) else null
        }
    }.getOrNull().orEmpty()
    return MediaUploadItem(bytes = bytes, fileName = name, mimeType = getType(uri).orEmpty())
}
