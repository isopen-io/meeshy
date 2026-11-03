package me.meeshy.sdk.model.call

/**
 * La livraison au moins une fois de l'offre et de la réponse SDP (§6.3, H3), miroir de iOS `CallSdpSignaler` /
 * `QualityThresholds` : 3 essais d'offre, 4 de réponse, délai initial 0,5 s doublé à chaque échec.
 */
object CallSignalRetryPolicy {
    const val OFFER_MAX_ATTEMPTS = 3
    const val ANSWER_TOTAL_ATTEMPTS = 4
    const val INITIAL_DELAY_MS = 500L

    /** Attente avant l'essai [attempt] (2 = premier retry) : 0,5 s, 1 s, 2 s… */
    fun delayBeforeMs(attempt: Int, initialMs: Long = INITIAL_DELAY_MS): Long =
        if (attempt <= 1) 0L else initialMs shl (attempt - 2)

    /** Délai du chien de garde « l'offre n'est jamais venue » après le décroché (iOS 30 s). */
    const val OFFER_NEVER_CAME_TIMEOUT_MS = 30_000L
}
