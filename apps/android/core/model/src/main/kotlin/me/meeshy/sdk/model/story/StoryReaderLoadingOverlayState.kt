package me.meeshy.sdk.model.story

/**
 * L'état de l'overlay de chargement à un instant : [elapsedMs] depuis l'arrivée sur la slide, [progress] du média.
 * Frame 0 : le fond flou (jamais noir) ; la miniature nette dès qu'elle est en cache ; le spinner petit seulement
 * après 200 ms, sous 0,20 de progression, et jamais sur un cache non vide ; retrait à 95 %.
 */
data class StoryReaderLoadingOverlayState(
    val elapsedMs: Long,
    val progress: Double,
    val hasCachedContent: Boolean = false,
) {
    val mounted: Boolean get() = StoryLoadingOverlayPolicy.isMounted(progress)

    val spinnerVisible: Boolean
        get() = mounted && !hasCachedContent && elapsedMs >= StoryLoadingOverlayPolicy.SPINNER_GRACE_MS &&
            StoryLoadingOverlayPolicy.armsSpinner(progress)

    companion object {
        /** Le spinner s'arme-t-il à la fin de la grâce ? Faux dès que du contenu est déjà en cache. */
        fun armsSpinner(progressAtGraceEnd: Double, hasCachedContent: Boolean): Boolean =
            !hasCachedContent && StoryLoadingOverlayPolicy.armsSpinner(progressAtGraceEnd)
    }
}
