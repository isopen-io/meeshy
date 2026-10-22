package me.meeshy.sdk.model.accessibility

/** Géométrie des cibles tactiles : miroir de `MeeshyTapTarget` (iOS), 48 dp sous Android. */
public object TapTargetGeometry {
    public const val MIN_DP: Float = 48f

    /** Marge à ajouter de chaque côté d'un glyphe de [visualSide] pour atteindre la cible minimale. */
    public fun inset(visualSide: Float, minSide: Float = MIN_DP): Float =
        maxOf(0f, (minSide - visualSide) / 2f)

    /** Côté réellement sensible d'un glyphe de [visualSide]. */
    public fun hitSide(visualSide: Float, minSide: Float = MIN_DP): Float =
        maxOf(visualSide, minSide)

    /** Deux cibles voisines se chevauchent si l'écart visuel est inférieur à la somme de leurs marges. */
    public fun overlaps(visualA: Float, visualB: Float, gap: Float): Boolean =
        gap < inset(visualA) + inset(visualB)
}
