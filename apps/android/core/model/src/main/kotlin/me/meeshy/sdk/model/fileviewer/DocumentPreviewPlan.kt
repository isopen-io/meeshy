package me.meeshy.sdk.model.fileviewer

import java.util.Locale

/**
 * Comment la fiche d'un document le montre : par le moteur de pages du système (PDF), par une vue web durcie
 * (images raster seulement) ou pas du tout. Un contenu actif (HTML, SVG) ne passe JAMAIS par la vue web : le nom
 * et le type, venus de l'expéditeur, doivent s'accorder.
 */
sealed interface DocumentPreviewPlan {
    data object Pdf : DocumentPreviewPlan
    data object Web : DocumentPreviewPlan
    data object Unavailable : DocumentPreviewPlan

    companion object {
        private val rasterMimes = setOf("image/png", "image/jpeg", "image/gif", "image/webp")
        private val rasterExtensions = setOf("png", "jpg", "jpeg", "gif", "webp")

        fun of(mimeType: String?, fileName: String?): DocumentPreviewPlan {
            val mime = mimeType.orEmpty().substringBefore(';').trim().lowercase(Locale.ROOT)
            val name = fileName.orEmpty().lowercase(Locale.ROOT)
            val extension = name.substringAfterLast('.', "")
            return when {
                mime == "application/pdf" || (mime.isEmpty() && extension == "pdf") -> Pdf
                mime in rasterMimes && (extension.isEmpty() || extension in rasterExtensions) -> Web
                else -> Unavailable
            }
        }
    }
}
