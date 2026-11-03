package me.meeshy.sdk.model

import kotlin.coroutines.cancellation.CancellationException

/**
 * Le fichier vidéo qui part réellement — miroir de `StoryVideoUploadFile` (iOS). La compression est un MIEUX, jamais une
 * condition : si elle échoue ou ne produit rien, la source part telle quelle, avec un mime de type vidéo.
 *
 * @property isDerived vrai quand [path] est une copie produite ici, que l'appelant supprime après l'envoi.
 */
data class StoryVideoUploadFile(val path: String, val mimeType: String, val isDerived: Boolean) {

    companion object {
        suspend fun prepared(source: String, compress: suspend (String) -> String?): StoryVideoUploadFile {
            val compressed = try {
                compress(source)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                null
            } ?: return StoryVideoUploadFile(source, mimeType(source), isDerived = false)
            return StoryVideoUploadFile(compressed, mimeType(compressed), isDerived = compressed != source)
        }

        fun mimeType(path: String): String =
            MimeTypeResolver.mimeTypeForFilename(path).takeIf { it.startsWith("video/") } ?: "video/mp4"
    }
}
