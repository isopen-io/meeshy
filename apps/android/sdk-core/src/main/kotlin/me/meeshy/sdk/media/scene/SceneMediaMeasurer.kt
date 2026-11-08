package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.scene.SceneMediaLoader
import me.meeshy.sdk.model.scene.SceneVideoMeasure

/**
 * Le chargement d'un média choisi pour la scène, hors du fil principal : UNE mesure vidéo pour la galerie et pour la
 * caméra (dimensions debout, ratio, durée — [SceneVideoMeasure]) et UN décodage d'image borné à 1080 px
 * ([SceneMediaLoader]). Un fichier illisible rend `null` : l'appelant annonce l'échec, il ne pose pas un carré.
 */
public object SceneMediaMeasurer {

    public suspend fun video(item: MediaUploadItem): SceneVideoMeasure? {
        val file = (item.source as? MediaUploadSource.OnDisk)?.file ?: return null
        return withContext(Dispatchers.IO) { video(file) }
    }

    public fun video(file: File): SceneVideoMeasure? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            fun number(key: Int) = retriever.extractMetadata(key)?.toLongOrNull()
            SceneVideoMeasure.of(
                rawWidth = number(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toInt(),
                rawHeight = number(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toInt(),
                rotationDegrees = number(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toInt(),
                durationMillis = number(MediaMetadataRetriever.METADATA_KEY_DURATION),
            )
        } catch (unreadable: RuntimeException) {
            null
        } finally {
            runCatching { retriever.release() }
        }
    }

    /** L'image décodée sans jamais dépasser 1080 px sur son grand côté ; `null` si elle ne se décode pas. */
    public suspend fun boundedImage(item: MediaUploadItem): Bitmap? = withContext(Dispatchers.IO) {
        runCatching {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            item.source.open().use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@runCatching null
            val options = BitmapFactory.Options().apply {
                inSampleSize = SceneMediaLoader.sampleSize(bounds.outWidth, bounds.outHeight)
            }
            item.source.open().use { BitmapFactory.decodeStream(it, null, options) }
        }.getOrNull()
    }
}
