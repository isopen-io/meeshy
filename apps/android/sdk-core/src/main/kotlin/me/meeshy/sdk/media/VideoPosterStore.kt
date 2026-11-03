package me.meeshy.sdk.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import me.meeshy.sdk.model.mediacache.MediaCacheKey

/** Poster persisté d'une vidéo, relu d'une session à l'autre. Clé = URL de la vidéo (`thumb:<url>` côté iOS). */
public interface VideoPosterStore {
    /** Décodé à [maxPixel] px au plus (jamais de frame pleine en mémoire pour une surface de liste). */
    public fun read(videoUrl: String, maxPixel: Int): Bitmap?
    public fun write(videoUrl: String, frame: Bitmap)
}

/** Magasin disque : un JPEG par vidéo, sous une clé canonique. */
public class DiskVideoPosterStore(private val dir: File) : VideoPosterStore {
    private fun fileFor(url: String) = File(dir, MediaCacheKey.of("thumb:$url"))

    override fun read(videoUrl: String, maxPixel: Int): Bitmap? {
        val file = fileFor(videoUrl).takeIf { it.isFile && it.length() > 0L } ?: return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSize(maxOf(bounds.outWidth, bounds.outHeight), maxPixel)
        }
        return BitmapFactory.decodeFile(file.absolutePath, options)
    }

    override fun write(videoUrl: String, frame: Bitmap) {
        runCatching {
            dir.mkdirs()
            fileFor(videoUrl).outputStream().use { frame.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
        }
    }

    internal companion object {
        const val JPEG_QUALITY = 80

        /** Plus grande puissance de deux gardant le plus grand côté au moins égal à [maxPixel]. */
        fun sampleSize(longest: Int, maxPixel: Int): Int {
            if (longest <= 0 || maxPixel <= 0) return 1
            var sample = 1
            while (longest / (sample * 2) >= maxPixel) sample *= 2
            return sample
        }
    }
}
