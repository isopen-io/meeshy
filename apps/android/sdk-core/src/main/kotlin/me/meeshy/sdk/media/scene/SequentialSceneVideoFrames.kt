package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import java.io.File

/**
 * **La relecture d'un export lit chaque vidéo en UN passage** (#14187, recette S8 : 9,5 s de vérification pour un clip de
 * 6 s rendu en 6 s). `MediaMetadataRetriever.getFrameAtTime(OPTION_CLOSEST)` ouvrait un décodeur à chaque instant, repartait
 * de l'image clé précédente et convertissait l'image pleine, pour le rendu comme pour la vidéo de fond. Ici chaque fichier a
 * UN décodeur, lu dans l'ordre ([SequentialVideoFrames]) : une image n'en sort qu'une fois, et seules les images relues se
 * convertissent, à la taille du décodeur. L'image remise est une copie, à celui qui la demande : le décodeur réécrit la
 * sienne à l'image suivante. Un fichier que le décodeur n'ouvre pas, ou qui lève en cours de lecture, se relit par [fallback].
 */
internal class SequentialSceneVideoFrames(
    private val open: (File) -> VideoFrameDecoder,
    private val fallback: SceneVideoFrameSource = RetrieverVideoFrames(),
) : SceneVideoFrameSource {

    private val readers = HashMap<String, SequentialVideoFrames>()
    private val refused = HashSet<String>()

    override fun frameAt(file: File, atMillis: Long): Bitmap? {
        val reader = readerOf(file) ?: return fallback.frameAt(file, atMillis)
        return try {
            reader.frameAt(atMillis)?.copy(Bitmap.Config.ARGB_8888, false)
        } catch (unreadable: RuntimeException) {
            SceneExportLog.warn("relecture en un passage interrompue (${file.name} à $atMillis ms), repli image par image", unreadable)
            refuse(file)
            fallback.frameAt(file, atMillis)
        }
    }

    override fun close() {
        readers.values.forEach { runCatching { it.release() } }
        readers.clear()
        refused.clear()
        fallback.close()
    }

    private fun readerOf(file: File): SequentialVideoFrames? {
        val key = file.absolutePath
        if (key in refused) return null
        readers[key]?.let { return it }
        return try {
            SequentialVideoFrames(open(file)).also { readers[key] = it }
        } catch (unreadable: Exception) {
            SceneExportLog.warn("décodeur indisponible (${file.name}), repli image par image", unreadable)
            refused += key
            null
        }
    }

    private fun refuse(file: File) {
        refused += file.absolutePath
        readers.remove(file.absolutePath)?.let { runCatching { it.release() } }
    }

    companion object {
        /** Sur l'appareil : `MediaCodec` en sortie mémoire, chaque image relue convertie à [maxLongSide] pixels au plus. */
        fun onDevice(maxLongSide: Int): SequentialSceneVideoFrames =
            SequentialSceneVideoFrames(open = { file -> CodecVideoFrameDecoder(file, maxLongSide) })
    }
}
