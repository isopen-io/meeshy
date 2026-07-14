package me.meeshy.ui.component.viewer

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.provider.MediaStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.GallerySaveTargetResolver
import java.net.HttpURLConnection
import java.net.URL

/**
 * Writes a viewed media into the device gallery via MediaStore.
 *
 * Exempt Android glue — a dumb executor of the pure [GallerySaveTargetResolver]
 * decision (which name / MIME / album), the way iOS's `PhotoLibraryManager`
 * executes the pure `MediaSaveDestination` rule. It reads no Meeshy singleton and
 * encodes no product cascade — it takes an opaque URL and streams its bytes into
 * the MediaStore collection the resolver picked — so it stays an SDK building
 * block. The scoped-storage insert ([Build.VERSION_CODES.Q]+) needs no runtime
 * permission; on older releases [isSupported] is `false` and the caller hides the
 * affordance rather than triggering a legacy `WRITE_EXTERNAL_STORAGE` prompt.
 */
public object GalleryImageSaver {

    public val isSupported: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    public suspend fun save(
        context: Context,
        url: String,
        mimeHint: String? = null,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            check(isSupported) { "Gallery save requires Android 10+" }
            val target = GallerySaveTargetResolver.resolve(url = url, mimeHint = mimeHint)
            val collection = if (target.mimeType.startsWith("video/")) {
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            } else {
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            }
            val pending = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, target.displayName)
                put(MediaStore.MediaColumns.MIME_TYPE, target.mimeType)
                put(MediaStore.MediaColumns.RELATIVE_PATH, target.relativePath)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val item = resolver.insert(collection, pending)
                ?: error("MediaStore insert returned null for $url")
            try {
                resolver.openOutputStream(item)?.use { output ->
                    openStream(url).use { input -> input.copyTo(output) }
                } ?: error("MediaStore output stream unavailable for $url")
                val published = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
                resolver.update(item, published, null, null)
            } catch (t: Throwable) {
                resolver.delete(item, null, null)
                throw t
            }
            Result.success(Unit)
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }

    private fun openStream(url: String): java.io.InputStream {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        connection.instanceFollowRedirects = true
        return connection.inputStream
    }

    private const val CONNECT_TIMEOUT_MS = 15_000
    private const val READ_TIMEOUT_MS = 15_000
}
