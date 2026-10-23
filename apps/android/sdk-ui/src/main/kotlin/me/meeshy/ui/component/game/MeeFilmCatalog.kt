package me.meeshy.ui.component.game

import me.meeshy.sdk.model.sticker.MeeStickerCatalog

/**
 * Les films de Mee et Meo que le jeu convoque. Le dessin n'a qu'une source : le catalogue de stickers
 * ([MeeStickerCatalog]) et ses `.lottie` embarqués ; le jeu n'en recopie aucun. Un identifiant inconnu ne résout
 * rien (figure vide), jamais d'exception.
 */
public object MeeFilmCatalog {
    public const val MEE_SOURIRE: String = "mee-sourire"
    public const val MEO_SALUT: String = "meo-salut"
    public const val MEE_BONJOUR: String = "mee-bonjour"
    public const val MEE_COUCOU: String = "mee-coucou"

    /** Les identifiants que le jeu choisit (guide, blason, trophées, Prestige, cartes photo). */
    public val gameFilmIds: List<String> = listOf(MEE_SOURIRE, MEO_SALUT, MEE_BONJOUR, MEE_COUCOU)

    /** Le chemin de l'asset du film, ou `null` si l'identifiant n'est pas au catalogue. */
    public fun assetPath(filmId: String): String? =
        MeeStickerCatalog.stickerById(filmId)?.let { MeeStickerCatalog.assetPath(it.id) }

    /** Le film porte-t-il un mouvement ? Faux pour un identifiant inconnu : il ne reste que l'image fixe. */
    public fun isAnimated(filmId: String): Boolean = MeeStickerCatalog.stickerById(filmId)?.animated == true
}
