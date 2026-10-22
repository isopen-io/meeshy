package me.meeshy.sdk.model.call

enum class CallSwipeOutcome { None, Minimize }

/**
 * Le glissé vers le bas qui réduit l'appel. Miroir de iOS `CallPiPPolicy.swipeDownOffset`
 * / `swipeDownOutcome` : course de 300, validation à 75 % ou sur un lancer dont la fin
 * prévue dépasse la course ; ni en groupe ni avec un panneau ouvert. Les valeurs sont en dp.
 */
object CallSwipeDismissRule {
    const val COURSE_DP: Float = 300f
    const val COMMIT_FRACTION: Float = 0.75f

    fun offset(translation: Float, isGroup: Boolean, isPanelOpen: Boolean): Float {
        if (isGroup || isPanelOpen) return 0f
        return translation.coerceIn(0f, COURSE_DP)
    }

    fun outcome(
        translation: Float,
        predictedTranslation: Float,
        isGroup: Boolean,
        isPanelOpen: Boolean,
    ): CallSwipeOutcome {
        if (isGroup || isPanelOpen || translation <= 0f) return CallSwipeOutcome.None
        val committed = translation >= COURSE_DP * COMMIT_FRACTION || predictedTranslation >= COURSE_DP
        return if (committed) CallSwipeOutcome.Minimize else CallSwipeOutcome.None
    }
}
