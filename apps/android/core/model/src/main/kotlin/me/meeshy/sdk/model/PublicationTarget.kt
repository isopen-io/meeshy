package me.meeshy.sdk.model

/** Où une capture ou un média importé est publié — miroir de `PublicationTarget` (iOS). */
enum class PublicationTarget(val wire: String) {
    POST("POST"),
    REEL("REEL"),
    STORY("STORY"),
}

/**
 * Règle de cible par défaut selon le type MIME : image -> post, vidéo/audio -> réel, le reste
 * (document, inconnu) n'a aucune cible. La story reste toujours offerte en alternative.
 */
object PublicationTargetRule {
    fun defaultTarget(mimeType: String?): PublicationTarget? {
        val mime = mimeType.orEmpty().trim().lowercase()
        return when {
            mime.startsWith("image/") -> PublicationTarget.POST
            mime.startsWith("video/") || mime.startsWith("audio/") -> PublicationTarget.REEL
            else -> null
        }
    }

    fun targets(mimeType: String?): List<PublicationTarget> {
        val fallback = defaultTarget(mimeType) ?: return emptyList()
        return listOf(fallback, PublicationTarget.STORY)
    }

    /**
     * Une capture faite DANS l'app exige une confirmation avant toute publication, quelle que
     * soit la cible : l'auteur voit ce qu'il envoie. Un média importé n'en exige pas.
     */
    @Suppress("UNUSED_PARAMETER")
    fun needsCaptureConfirmation(capturedInApp: Boolean, target: PublicationTarget): Boolean = capturedInApp
}
