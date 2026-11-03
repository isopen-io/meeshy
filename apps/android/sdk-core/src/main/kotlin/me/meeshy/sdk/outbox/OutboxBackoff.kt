package me.meeshy.sdk.outbox

/**
 * Délai avant le prochain essai d'une ligne (miroir de `RetryPolicy.messageOutbox` : 2 s, doublé à chaque échec, plafonné
 * à 30 s, plus un jitter d'au plus 0,5 s). Il se porte par ligne (`nextAttemptAt`) : une ligne en attente ne bloque que
 * sa propre lane.
 */
public object OutboxBackoff {
    public const val FIRST_DELAY_MS: Long = 2_000L
    public const val MAX_DELAY_MS: Long = 30_000L
    public const val MAX_JITTER_MS: Long = 500L

    /** [failures] = nombre d'échecs déjà comptés (au moins 1) ; [jitterSample] dans `[0, 1]`, injecté pour les tests. */
    public fun delayMs(failures: Int, jitterSample: Double = Math.random()): Long {
        val exponent = (maxOf(1, failures) - 1).coerceAtMost(16)
        val base = minOf(MAX_DELAY_MS, FIRST_DELAY_MS shl exponent)
        return base + (MAX_JITTER_MS * jitterSample.coerceIn(0.0, 1.0)).toLong()
    }

    /** Pause d'une ligne dont le transport a échoué : aucun essai n'est compté, donc aucun exposant ; le réseau revenu la relance avant. */
    public const val TRANSPORT_DELAY_MS: Long = 10_000L

    public fun transportDelayMs(jitterSample: Double = Math.random()): Long =
        TRANSPORT_DELAY_MS + (MAX_JITTER_MS * jitterSample.coerceIn(0.0, 1.0)).toLong()
}
