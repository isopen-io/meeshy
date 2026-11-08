package me.meeshy.app.stories

import java.io.File

/**
 * La couture de compression vidéo de la publication (miroir de `MediaCompressor.compressVideo(context: .story)`, iOS).
 * Rend le fichier compressé, ou `null` quand rien n'est à gagner : l'envoi retombe alors sur la source
 * ([me.meeshy.sdk.model.StoryVideoUploadFile.prepared]). Inerte par défaut tant qu'aucun encodeur n'est lié.
 */
internal fun interface StoryVideoCompressor {
    suspend fun compress(source: File): File?

    companion object {
        val None: StoryVideoCompressor = StoryVideoCompressor { null }
    }
}
