package me.meeshy.sdk.media.scene

import android.media.MediaMetadataRetriever
import java.io.File

/** La durée d'un fichier rapatrié pour un export, lue dans son conteneur ; `null` quand il ne se lit pas. */
public object SceneMediaProbe {
    public fun durationMillis(file: File): Long? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.takeIf { it > 0L }
        } catch (unreadable: RuntimeException) {
            null
        } finally {
            runCatching { retriever.release() }
        }
    }
}
