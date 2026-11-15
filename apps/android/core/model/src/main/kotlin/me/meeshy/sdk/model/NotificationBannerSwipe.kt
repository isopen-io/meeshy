package me.meeshy.sdk.model

/**
 * La décision du geste sur la bannière in-app — miroir de `NotificationBannerSwipe.outcome` (iOS,
 * `NotificationToastView.swift`). Le haut ferme (translation ou fin prédite), le bas ouvre l'aperçu de
 * la conversation, le reste laisse la carte revenir. La carte ne suit le doigt que vers le haut.
 */
object NotificationBannerSwipe {
    enum class Outcome { Dismiss, Preview, None }

    const val DISMISS_TRANSLATION = -30f
    const val DISMISS_PREDICTED_END = -80f
    const val PREVIEW_TRANSLATION = 36f
    const val LONG_PRESS_MILLIS = 350L
    const val TAP_SUPPRESSION_MILLIS = 600L
    const val OPEN_AFTER_CLOSE_MILLIS = 100L

    /** Durée (s) de projection de la vélocité : approxime `predictedEndTranslation` d'iOS. */
    private const val PREDICTION_HORIZON_SECONDS = 0.25f

    fun outcome(translation: Float, predictedEnd: Float): Outcome = when {
        translation < DISMISS_TRANSLATION || predictedEnd < DISMISS_PREDICTED_END -> Outcome.Dismiss
        translation > PREVIEW_TRANSLATION -> Outcome.Preview
        else -> Outcome.None
    }

    /** Le décalage vertical de la carte : seules les valeurs négatives (vers le haut) la déplacent. */
    fun lift(translation: Float): Float = minOf(0f, translation)

    fun predictedEnd(translation: Float, velocityPerSecond: Float): Float =
        translation + velocityPerSecond * PREDICTION_HORIZON_SECONDS

    /** Un tap tombé juste après une présentation modale appartient à la fermeture de celle-ci. */
    fun isTapSuppressed(nowMillis: Long, lastModalPresentedAtMillis: Long?): Boolean =
        lastModalPresentedAtMillis != null && nowMillis - lastModalPresentedAtMillis < TAP_SUPPRESSION_MILLIS
}
