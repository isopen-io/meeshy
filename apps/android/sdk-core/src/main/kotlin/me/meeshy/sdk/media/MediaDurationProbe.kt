package me.meeshy.sdk.media

import android.media.MediaMetadataRetriever
import java.io.File

/** La durée d'un fichier vidéo ou son, lue par le système à la prise (#13606) ; `null` quand il ne la dit pas. */
internal object MediaDurationProbe {
    fun probe(file: File, @Suppress("UNUSED_PARAMETER") mimeType: String): Long? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.path)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
        } finally {
            runCatching { retriever.release() }
        }
    }
}
