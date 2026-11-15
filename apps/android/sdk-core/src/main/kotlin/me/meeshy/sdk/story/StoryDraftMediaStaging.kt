package me.meeshy.sdk.story

import java.io.File
import kotlinx.coroutines.CancellationException

/**
 * Recopie dans [directory] les médias que l'appareil détient pour [mediaIds] (nom de fichier -> copie). Un média que
 * l'appareil n'a pas (déjà téléversé) est simplement absent du résultat ; une lecture qui ÉCHOUE rend `null` : l'appelant
 * s'arrête alors sans rien retirer de ce qu'il copiait.
 */
internal suspend fun copyNamedMedia(
    mediaIds: List<String>,
    source: LegacyDraftMediaSource,
    directory: File,
): Map<String, File>? {
    val copied = mutableMapOf<String, File>()
    for (mediaId in mediaIds) {
        val file = try {
            source.copy(mediaId, directory)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            return null
        }
        if (file != null) copied[file.name] = file
    }
    return copied
}
