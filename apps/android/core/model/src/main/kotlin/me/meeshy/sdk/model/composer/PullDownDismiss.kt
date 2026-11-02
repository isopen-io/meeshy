package me.meeshy.sdk.model.composer

/** What a released pull does: nothing, lower the keyboard first, or close the plateau like the cross. */
enum class PullOutcome { NONE, HIDE_KEYBOARD, DISMISS }

/**
 * Le glissé vers le bas qui ferme le plateau (la croix reste la porte nette). La distance cumulée est celle
 * que le contenu n'a pas absorbée — une liste qui défile encore ne ferme rien. Valeur immuable, éprouvable
 * sans écran.
 */
data class PullDownDismiss(val distanceDp: Float = 0f) {
    val shouldDismiss: Boolean get() = distanceDp >= THRESHOLD_DP

    fun pulled(deltaDp: Float): PullDownDismiss = copy(distanceDp = (distanceDp + deltaDp).coerceAtLeast(0f))

    fun released(): PullDownDismiss = PullDownDismiss()

    /**
     * Un jet rapide ferme à partir d'un amorçage RÉEL du tirage — jamais un défilement ordinaire qui bute sur le haut
     * de la carte et n'en laisse que quelques points.
     */
    fun shouldDismissOnFling(velocityDpPerSecond: Float): Boolean =
        distanceDp >= FLING_MIN_DISTANCE_DP && velocityDpPerSecond >= FLING_VELOCITY_DP

    /**
     * With the keyboard up, the first pull lowers it (iOS `scrollDismissesKeyboard(.interactively)`): an author who
     * drags down while typing wants to see the card, not to leave it.
     */
    fun outcome(velocityDpPerSecond: Float, keyboardOpen: Boolean): PullOutcome = when {
        !shouldDismiss && !shouldDismissOnFling(velocityDpPerSecond) -> PullOutcome.NONE
        keyboardOpen -> PullOutcome.HIDE_KEYBOARD
        else -> PullOutcome.DISMISS
    }

    companion object {
        const val THRESHOLD_DP = 120f
        const val FLING_VELOCITY_DP = 900f
        const val FLING_MIN_DISTANCE_DP = 24f
    }
}
