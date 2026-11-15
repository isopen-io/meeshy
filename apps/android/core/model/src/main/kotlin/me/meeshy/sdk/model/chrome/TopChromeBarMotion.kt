package me.meeshy.sdk.model.chrome

/** Comment une barre du haut ENTRE et SORT (miroir de iOS `TopChromeBarMotion`). */
public object TopChromeBarMotion {
    public sealed interface Exit {
        /** « Reduire les animations » : aucune translation. */
        public data object Fade : Exit

        /** La barre remonte de sa hauteur plus [clearanceDp] (l'encart de la barre d'etat pour la derniere barre). */
        public data class SlideUp(val clearanceDp: Float) : Exit
    }

    public fun exit(isLastBar: Boolean, reduceMotion: Boolean, safeAreaTopDp: Float): Exit = when {
        reduceMotion -> Exit.Fade
        else -> Exit.SlideUp(if (isLastBar) safeAreaTopDp else 0f)
    }

    /** Rang de la bande : au-dessus du contenu (0), sous toute barre. */
    public const val BAND_LAYER: Float = 1f

    /** La derniere barre passe DEVANT la bande (2) ; une barre qui se range passe dessous, l'appel au-dessus de l'audio. */
    public fun layer(isLastBar: Boolean, isCall: Boolean): Float = when {
        isLastBar -> 2f
        isCall -> 0.6f
        else -> 0.5f
    }

    /** Hauteur agregee du chrome du haut : la plus haute des barres visibles (0 sans barre). */
    public fun aggregateHeightDp(barHeightsDp: List<Float>): Float = barHeightsDp.maxOrNull()?.coerceAtLeast(0f) ?: 0f
}
