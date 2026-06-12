package me.meeshy.app.chat

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.net.UploadableFile
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Reads a picked content Uri into an [UploadableFile] off the main thread.
 * Returns null when the provider cannot serve the bytes — the caller skips
 * the file rather than failing the whole batch.
 */
@Singleton
class ImageAttachmentReader @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    suspend fun read(uri: Uri): UploadableFile? = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        val bytes = runCatching {
            resolver.openInputStream(uri)?.use { it.readBytes() }
        }.getOrNull() ?: return@withContext null
        val mimeType = resolver.getType(uri) ?: "image/jpeg"
        UploadableFile(
            fileName = displayName(uri) ?: "image-${System.currentTimeMillis()}",
            mimeType = mimeType,
            bytes = bytes,
        )
    }

    private fun displayName(uri: Uri): String? = runCatching {
        context.contentResolver
            .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
    }.getOrNull()
}
