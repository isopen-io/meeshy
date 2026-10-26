package me.meeshy.app.stories

import kotlin.math.abs

/**
 * Géométrie PURE du geste qui change d'auteur ou ferme le lecteur (iOS
 * `StoryViewerCardTransform` + `StoryGroupSwipeDecision`) : la carte tourne autour de
 * l'arête qui la relie à l'auteur voisin, comme la face d'un cube, et glisse + rétrécit
 * quand on la tire vers le bas. Le Composable ne fait que lire ces valeurs en phase de
 * dessin (`graphicsLayer`) — aucune recomposition pendant le geste.
 */
object StoryCubeTransform {
    /** Rotation de la face sortante quand le doigt a parcouru toute la largeur. */
    const val MAX_ROTATION_DEGREES = 70f

    /** Au-delà du dernier / avant le premier auteur, le doigt tire une carte qui résiste. */
    const val EDGE_RESISTANCE = 0.25f

    /** Part du déplacement horizontal gardée quand il n'y a PAS d'auteur voisin. */
    fun resisted(dragX: Float, hasNextGroup: Boolean, hasPreviousGroup: Boolean): Float = when {
        dragX < 0f && !hasNextGroup -> dragX * EDGE_RESISTANCE
        dragX > 0f && !hasPreviousGroup -> dragX * EDGE_RESISTANCE
        else -> dragX
    }

    /** Avancement du geste, −1 (tout à gauche) … 1 (tout à droite). */
    fun fraction(dragX: Float, width: Float): Float =
        if (width <= 0f) 0f else (dragX / width).coerceIn(-1f, 1f)

    /**
     * Doigt vers la gauche (fraction < 0) : la face s'ouvre vers l'auteur SUIVANT, le côté
     * gauche s'éloigne — rotation négative autour de l'arête droite ; symétrique vers la droite.
     */
    fun rotationYDegrees(fraction: Float): Float = fraction * MAX_ROTATION_DEGREES

    /** Arête-charnière : le bord opposé au sens du geste (0 = gauche, 1 = droite). */
    fun pivotFractionX(fraction: Float): Float = if (fraction < 0f) 1f else 0f

    /** Échelle de la carte tirée vers le bas : 1 au repos, 0,85 quand elle a parcouru la hauteur. */
    fun dismissScale(dragY: Float, height: Float): Float {
        if (height <= 0f) return 1f
        val travelled = (dragY.coerceAtLeast(0f) / height).coerceIn(0f, 1f)
        return 1f - 0.15f * travelled
    }

    /** Opacité de la carte tirée vers le bas : elle s'efface à mesure qu'on la ferme. */
    fun dismissAlpha(dragY: Float, height: Float): Float {
        if (height <= 0f) return 1f
        val travelled = (dragY.coerceAtLeast(0f) / height).coerceIn(0f, 1f)
        return 1f - 0.5f * travelled
    }

    /** Le geste est un changement d'auteur plutôt qu'une fermeture : l'axe dominant est l'horizontal. */
    fun isHorizontal(dragX: Float, dragY: Float): Boolean = abs(dragX) > abs(dragY)
}
