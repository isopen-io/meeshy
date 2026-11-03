package me.meeshy.sdk.model.sticker

/**
 * La loi du mouvement d'un sticker Mee ou Meo (iOS `MeeStickerFilmView`) : image fixe tout de suite, film seulement si la case
 * reste à l'écran, boucle tant qu'elle y est, jamais sous « Réduire les animations ». Pure : l'écran n'en est que la projection.
 */
object MeeStickerMotionPolicy {
    /** Le temps qu'une case reste à l'écran avant que son film se monte ; une case qui ne fait que passer ne monte rien. */
    const val FILM_DELAY_MILLIS: Long = 150

    /** Définition maximale de l'image fixe d'une case posée (bulle, story, feuille d'un seul sticker). */
    const val DEFAULT_PIXEL_CAP: Int = 360

    /** Définition maximale de l'image fixe d'une case de la grille de la feuille. */
    const val GRID_PIXEL_CAP: Int = 180

    /** La définition à laquelle le film est rendu en image (PNG joint à l'envoi). */
    const val FILM_PIXEL_SIZE: Int = 360

    /** Le côté d'une case de la feuille, en dp, et le nombre de colonnes de ses rangées. */
    const val CELL_SIDE_DP: Int = 96
    const val COLUMNS: Int = 3

    enum class Motion { STATIC, PAUSED, PLAYING }

    /**
     * [requested] : l'hôte veut du mouvement (faux pour les vignettes) ; [filmAnimated] : le film en porte un ; [onScreen] :
     * la case est visible ; [scrollingFast] : la liste défile vite. Réduire les animations l'emporte sur tout : l'image fixe.
     */
    fun motion(
        reduceMotion: Boolean,
        requested: Boolean,
        filmAnimated: Boolean,
        onScreen: Boolean = true,
        scrollingFast: Boolean = false,
    ): Motion = when {
        reduceMotion || !requested || !filmAnimated -> Motion.STATIC
        !onScreen || scrollingFast -> Motion.PAUSED
        else -> Motion.PLAYING
    }

    /** Un film joue en boucle : seule une animation en un coup (jamais pour un Mee) s'arrêterait. */
    fun loops(film: MeeSticker?): Boolean = film?.animated ?: true

    /** Le côté en pixels de l'image décodée : la case à la densité de l'écran, plafonnée par [cap] et par la définition du film. */
    fun decodePixelSize(sidePx: Float, cap: Int = DEFAULT_PIXEL_CAP): Int {
        if (!sidePx.isFinite() || sidePx <= 0f) return 1
        return minOf(cap, FILM_PIXEL_SIZE, kotlin.math.ceil(sidePx.toDouble()).toInt()).coerceAtLeast(1)
    }
}
