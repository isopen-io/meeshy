package me.meeshy.sdk.media

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.GallerySaveTarget
import me.meeshy.sdk.model.GallerySaveTargetResolver
import me.meeshy.sdk.model.MediaFingerprint
import me.meeshy.sdk.model.MediaSaveLedger
import me.meeshy.sdk.model.MediaSaveOutcome
import me.meeshy.sdk.model.MediaStoreWrite

/**
 * Écrit un média distant dans la galerie (album « Meeshy ») — UNE fois (#14642).
 *
 * Exécutant muet de la règle pure [GallerySaveTargetResolver] (nom, MIME, album) et du registre
 * [MediaSaveLedger] : les octets sont d'abord rapatriés dans un fichier temporaire, leur empreinte
 * SHA-256 est cherchée dans le registre, et MediaStore n'est écrit que si la galerie ne les a pas
 * déjà. Un média déjà présent est un succès ([MediaSaveOutcome.ALREADY_PRESENT]). L'écriture
 * cloisonnée (Android 10+) n'exige aucune permission ; en deçà, [isSupported] est faux et rien
 * n'est tenté.
 */
public class GalleryMediaSaver(
    context: Context,
    private val ledger: MediaSaveLedger = MediaSaveLedgers.shared(context),
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    private val appContext = context.applicationContext

    public suspend fun saveRemote(url: String, mimeHint: String? = null): MediaSaveOutcome = withContext(io) {
        if (!isSupported) return@withContext MediaSaveOutcome.FAILED
        val target = GallerySaveTargetResolver.resolve(url = url, mimeHint = mimeHint)
        val staging = File(File(appContext.cacheDir, STAGING_DIR).apply { mkdirs() }, UUID.randomUUID().toString())
        try {
            download(url, staging)
            val fingerprint = staging.inputStream().use(MediaFingerprint::of)
            val named = GallerySaveTargetResolver.byContent(target, fingerprint)
            ledger.saveOnce(fingerprint, named.entryName) { insert(staging, named) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            MediaSaveOutcome.FAILED
        } finally {
            staging.delete()
        }
    }

    /**
     * Écrit [file] sous le nom dérivé de son contenu. Si MediaStore a dû le renommer, un fichier de ce nom — donc ce
     * média — occupait déjà l'album, peut-être d'une installation précédente : la copie est retirée (#14651).
     */
    private fun insert(file: File, target: GallerySaveTarget): MediaStoreWrite {
        val collection = if (target.mimeType.startsWith("video/")) {
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }
        val resolver = appContext.contentResolver
        val pending = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, target.displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, target.mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, target.relativePath)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val item = resolver.insert(collection, pending) ?: return MediaStoreWrite.Failed
        if (nameOf(item, target) == MediaStoreWrite.NameTaken) {
            resolver.delete(item, null, null)
            return MediaStoreWrite.NameTaken
        }
        return try {
            resolver.openOutputStream(item)?.use { output -> file.inputStream().use { it.copyTo(output) } }
                ?: error("MediaStore output stream unavailable")
            resolver.update(item, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            val written = nameOf(item, target)
            if (written == MediaStoreWrite.NameTaken) resolver.delete(item, null, null)
            written
        } catch (failure: Exception) {
            resolver.delete(item, null, null)
            throw failure
        }
    }

    /** Le nom que MediaStore a VRAIMENT donné à [item] — lisible sans permission : l'entrée est à l'app. */
    private fun nameOf(item: Uri, target: GallerySaveTarget): MediaStoreWrite {
        val projection = arrayOf(MediaStore.MediaColumns.DISPLAY_NAME)
        val actual = runCatching {
            val cursor = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val includePending = Bundle().apply { putInt(MediaStore.QUERY_ARG_MATCH_PENDING, MediaStore.MATCH_INCLUDE) }
                appContext.contentResolver.query(item, projection, includePending, null)
            } else {
                @Suppress("DEPRECATION")
                appContext.contentResolver.query(MediaStore.setIncludePending(item), projection, null, null, null)
            }
            cursor?.use { if (it.moveToFirst()) it.getString(0) else null }
        }.getOrNull()
        return MediaStoreWrite.classify(uri = item.toString(), requested = target.displayName, actual = actual)
    }

    private fun download(url: String, into: File) {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = TIMEOUT_MS
        connection.readTimeout = TIMEOUT_MS
        connection.instanceFollowRedirects = true
        try {
            connection.inputStream.use { input -> into.outputStream().use { input.copyTo(it) } }
        } finally {
            connection.disconnect()
        }
    }

    public companion object {
        public val isSupported: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

        private const val STAGING_DIR = "gallery-save"
        private const val TIMEOUT_MS = 15_000
    }
}
