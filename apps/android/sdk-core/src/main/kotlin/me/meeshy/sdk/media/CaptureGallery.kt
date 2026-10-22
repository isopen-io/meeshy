package me.meeshy.sdk.media

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Ce que la capture enregistre en galerie (miroir de `ComposerGalleryProviding` iOS) : les
 * OCTETS tels que l'appareil les a produits, EXIF compris — aucun aller-retour par un
 * `Bitmap`. Un refus se dit : le résultat est `false`, l'appelant le signale.
 */
public interface CaptureGallery {
    public suspend fun saveImage(jpeg: ByteArray, displayName: String): Boolean

    public suspend fun saveVideo(file: File, displayName: String): Boolean
}

/**
 * [CaptureGallery] sur MediaStore, album « Meeshy ». Dès l'API 29 l'écriture dans l'album
 * de l'app n'exige aucune permission (stockage cloisonné) ; en deçà, elle exigerait
 * `WRITE_EXTERNAL_STORAGE`, que l'app ne demande pas : le refus est alors honnête (`false`).
 */
public class MediaStoreCaptureGallery(
    private val context: Context,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : CaptureGallery {

    override suspend fun saveImage(jpeg: ByteArray, displayName: String): Boolean =
        write(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, displayName, "image/jpeg", Environment.DIRECTORY_PICTURES) { out ->
            out.write(jpeg)
        }

    override suspend fun saveVideo(file: File, displayName: String): Boolean =
        write(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, displayName, "video/mp4", Environment.DIRECTORY_MOVIES) { out ->
            file.inputStream().use { it.copyTo(out) }
        }

    private suspend fun write(
        collection: android.net.Uri,
        displayName: String,
        mimeType: String,
        directory: String,
        body: (java.io.OutputStream) -> Unit,
    ): Boolean = withContext(io) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return@withContext false
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "$directory/$ALBUM")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = runCatching { resolver.insert(collection, values) }.getOrNull() ?: return@withContext false
        val written = runCatching {
            resolver.openOutputStream(uri)?.use { body(it) } != null
        }.getOrDefault(false)
        if (!written) {
            runCatching { resolver.delete(uri, null, null) }
            return@withContext false
        }
        val done = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
        runCatching { resolver.update(uri, done, null, null) }.isSuccess
    }

    private companion object {
        private const val ALBUM = "Meeshy"
    }
}
