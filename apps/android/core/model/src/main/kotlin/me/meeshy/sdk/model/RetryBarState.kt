package me.meeshy.sdk.model

/** Phase de la bande de renvoi d'un envoi échoué (iOS `BubbleFailedRetryBar`). */
enum class RetryBarPhase { Hidden, Rest, Retrying }

/**
 * État pur de la bande orange : fixe au repos, spinner + clignotement doux après un toucher,
 * retirée dès que le statut quitte l'échec, recréée fixe si l'envoi échoue de nouveau.
 */
data class RetryBarState(val phase: RetryBarPhase = RetryBarPhase.Hidden) {
    val isVisible: Boolean get() = phase != RetryBarPhase.Hidden

    /** Le toucher engage un renvoi ; un second toucher pendant le renvoi est ignoré. */
    fun onTap(): RetryBarState = if (phase == RetryBarPhase.Rest) RetryBarState(RetryBarPhase.Retrying) else this

    /** Suit le statut : hors échec la bande disparaît, un nouvel échec la recrée fixe. */
    fun onFailedChanged(isFailed: Boolean): RetryBarState = when {
        !isFailed -> RetryBarState(RetryBarPhase.Hidden)
        phase == RetryBarPhase.Hidden -> RetryBarState(RetryBarPhase.Rest)
        else -> this
    }

    /** Le clignotement ne tourne qu'une fois le renvoi engagé, et jamais sous Réduire les animations. */
    fun blinks(reduceMotion: Boolean): Boolean = phase == RetryBarPhase.Retrying && !reduceMotion

    companion object {
        const val REST_OPACITY: Float = 0.92f
        const val BLINK_OPACITY: Float = 1.0f
        const val BLINK_MILLIS: Int = 600

        /** Largeur visible de la bande et cible tactile minimale, en dp. */
        const val BAND_WIDTH_DP: Int = 32
        const val MIN_TARGET_DP: Int = 48

        fun forStatus(isFailed: Boolean): RetryBarState = RetryBarState().onFailedChanged(isFailed)
    }
}
