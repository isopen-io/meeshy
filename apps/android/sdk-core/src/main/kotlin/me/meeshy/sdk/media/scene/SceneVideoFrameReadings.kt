package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import java.io.File

/** Ce qui sort une image d'une vidéo à un instant ; [close] libère ce qu'il a ouvert. */
internal interface SceneVideoFrameSource {
    fun frameAt(file: File, atMillis: Long): Bitmap?
    fun close()
}

/**
 * Les images de vidéo d'UNE relecture (#14088) : chaque (fichier, instant) se décode une fois, quelle que soit la
 * mesure qu'on y prend — la luminance de l'image entière, puis la couleur d'une région par vidéo posée. Seuls la mesure
 * et la réduction de l'image restent en mémoire, jamais l'image pleine ; [release] rend tout à la fin de la relecture.
 */
internal class SceneVideoFrameReadings(
    private val source: SceneVideoFrameSource,
    private val measure: (Bitmap) -> Int,
    private val reduce: (Bitmap) -> Bitmap,
) {
    class Reading(val luma: Int, val reduced: Bitmap)

    private val readings = HashMap<Pair<String, Long>, Reading?>()

    fun of(file: File, atMillis: Long): Reading? = readings.getOrPut(file.absolutePath to atMillis) { read(file, atMillis) }

    private fun read(file: File, atMillis: Long): Reading? {
        val frame = source.frameAt(file, atMillis) ?: return null
        val reduced = reduce(frame)
        return try {
            Reading(measure(frame), reduced)
        } finally {
            if (reduced !== frame) frame.recycle()
        }
    }

    fun release() {
        readings.values.forEach { it?.reduced?.recycle() }
        readings.clear()
        source.close()
    }
}

/**
 * Les images d'une vidéo par `MediaMetadataRetriever`, un lecteur ouvert par fichier le temps de la relecture : le repli de
 * [SequentialSceneVideoFrames] quand le décodeur ne lit pas un fichier, chaque instant repartant de l'image clé précédente.
 */
internal class RetrieverVideoFrames : SceneVideoFrameSource {
    private val retrievers = HashMap<String, MediaMetadataRetriever>()

    override fun frameAt(file: File, atMillis: Long): Bitmap? = try {
        retrieverOf(file).getFrameAtTime(atMillis * MICROS_PER_MILLI, MediaMetadataRetriever.OPTION_CLOSEST)
    } catch (unreadable: RuntimeException) {
        SceneExportLog.warn("image illisible (${file.name} à $atMillis ms)", unreadable)
        null
    }

    private fun retrieverOf(file: File): MediaMetadataRetriever = retrievers.getOrPut(file.absolutePath) {
        MediaMetadataRetriever().apply {
            try {
                setDataSource(file.absolutePath)
            } catch (unreadable: RuntimeException) {
                release()
                throw unreadable
            }
        }
    }

    override fun close() {
        retrievers.values.forEach { runCatching { it.release() } }
        retrievers.clear()
    }

    private companion object {
        const val MICROS_PER_MILLI = 1000L
    }
}
