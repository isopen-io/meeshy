package me.meeshy.sdk.model.fullscreen

/**
 * L'état de chargement d'une page image du plein écran — miroir de
 * `GalleryImageLoadPhase` (`ConversationMediaGalleryView+LoadFailure.swift`, #8141).
 *
 * Un fichier purgé, expiré ou refusé ne produira jamais d'image : sans cet état, la page
 * restait sur son fond flou ou sur du noir, sans rien à faire. L'échec est un état, et
 * « Réessayer » en sort par une NOUVELLE tentative — [attempt] change l'identité de la
 * requête, qui est donc rejouée au lieu d'être supposée.
 */
public data class GalleryImageLoadPhase(
    val isFailed: Boolean = false,
    val attempt: Int = 0,
) {
    /** Le réseau n'a rien rendu pour la tentative COURANTE ; une tentative remplacée ne compte plus. */
    public fun failed(attempt: Int): GalleryImageLoadPhase =
        if (attempt == this.attempt) copy(isFailed = true) else this

    public fun retried(): GalleryImageLoadPhase = GalleryImageLoadPhase(isFailed = false, attempt = attempt + 1)
}
