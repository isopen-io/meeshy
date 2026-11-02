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
import me.meeshy.sdk.model.MediaFingerprint
import me.meeshy.sdk.model.MediaSaveLedger

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
 * de l'app n'exige aucune permission (stockage cloisonné) ; en deçà (Android 8–9), le fichier
 * public s'écrit sous `WRITE_EXTERNAL_STORAGE`, que l'appelant obtient d'abord par la porte
 * unique (`PermissionNature.PHOTO_LIBRARY_ADD`) — sans elle le refus est honnête (`false`), et
 * un échec ne laisse ni fichier ni entrée.
 *
 * **Une seule fois** (#14642) : l'empreinte des octets passe par le registre partagé
 * [MediaSaveLedger] — une capture déjà dans la galerie n'est pas réécrite, et c'est un succès.
 */
public class MediaStoreCaptureGallery(
    private val context: Context,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val ledger: MediaSaveLedger = MediaSaveLedgers.shared(context),
) : CaptureGallery {

    override suspend fun saveImage(jpeg: ByteArray, displayName: String): Boolean =
        once({ MediaFingerprint.of(jpeg) }) {
            write(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, displayName, "image/jpeg", Environment.DIRECTORY_PICTURES) { out ->
                out.write(jpeg)
            }
        }

    override suspend fun saveVideo(file: File, displayName: String): Boolean =
        once({ file.inputStream().use(MediaFingerprint::of) }) {
            write(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, displayName, "video/mp4", Environment.DIRECTORY_MOVIES) { out ->
                file.inputStream().use { it.copyTo(out) }
            }
        }

    private suspend fun once(fingerprint: () -> String, write: () -> String?): Boolean = withContext(io) {
        val signature = runCatching(fingerprint).getOrNull() ?: return@withContext write() != null
        ledger.saveOnce(signature) { write() }.isInGallery
    }

    private fun write(
        collection: android.net.Uri,
        displayName: String,
        mimeType: String,
        directory: String,
        body: (java.io.OutputStream) -> Unit,
    ): String? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return writeLegacy(collection, displayName, mimeType, directory, body)
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "$directory/$ALBUM")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = runCatching { resolver.insert(collection, values) }.getOrNull() ?: return null
        val written = runCatching {
            resolver.openOutputStream(uri)?.use { body(it) } != null
        }.getOrDefault(false)
        if (!written) {
            runCatching { resolver.delete(uri, null, null) }
            return null
        }
        val done = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
        return if (runCatching { resolver.update(uri, done, null, null) }.isSuccess) uri.toString() else null
    }

    @Suppress("DEPRECATION")
    private fun writeLegacy(
        collection: android.net.Uri,
        displayName: String,
        mimeType: String,
        directory: String,
        body: (java.io.OutputStream) -> Unit,
    ): String? {
        val file = File(File(Environment.getExternalStoragePublicDirectory(directory), ALBUM), displayName)
        return runCatching {
            file.parentFile?.mkdirs()
            file.outputStream().use(body)
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
                put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                put(MediaStore.MediaColumns.DATA, file.absolutePath)
            }
            checkNotNull(context.contentResolver.insert(collection, values)).toString()
        }.onFailure { file.delete() }.getOrNull()
    }

    private companion object {
        private const val ALBUM = "Meeshy"
    }
}
