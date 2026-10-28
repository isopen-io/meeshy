package me.meeshy.sdk.model.composer

/**
 * Le glissé vers le bas qui ferme le plateau (la croix reste la porte nette). La distance cumulée est celle
 * que le contenu n'a pas absorbée — une liste qui défile encore ne ferme rien. Valeur immuable, éprouvable
 * sans écran.
 */
data class PullDownDismiss(val distanceDp: Float = 0f) {
    val shouldDismiss: Boolean get() = distanceDp >= THRESHOLD_DP

    fun pulled(deltaDp: Float): PullDownDismiss = copy(distanceDp = (distanceDp + deltaDp).coerceAtLeast(0f))

    fun released(): PullDownDismiss = PullDownDismiss()

    /** Un jet rapide ferme à partir d'un amorçage réel du tirage — jamais un défilement ordinaire qui s'achève. */
    fun shouldDismissOnFling(velocityDpPerSecond: Float): Boolean =
        distanceDp > 0f && velocityDpPerSecond >= FLING_VELOCITY_DP

    companion object {
        const val THRESHOLD_DP = 120f
        const val FLING_VELOCITY_DP = 900f
    }
}
