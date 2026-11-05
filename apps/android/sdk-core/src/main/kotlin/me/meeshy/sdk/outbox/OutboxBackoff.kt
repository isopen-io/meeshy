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

    /**
     * Les retraits de conversation (quitter, supprimer pour moi / pour tous) ont leur propre cadence (iOS `RetryPolicy.stateSync`) :
     * 5 s doublées à chaque échec, plafonnées à 60 s — un retrait n'a pas l'urgence d'un message, il ne martèle pas la passerelle.
     */
    public const val CONVERSATION_STATE_FIRST_DELAY_MS: Long = 5_000L
    public const val CONVERSATION_STATE_MAX_DELAY_MS: Long = 60_000L

    private val conversationStateKinds: Set<OutboxKind> = setOf(
        OutboxKind.LEAVE_CONVERSATION,
        OutboxKind.DELETE_CONVERSATION_FOR_ME,
        OutboxKind.DELETE_CONVERSATION_FOR_ALL,
    )

    /** [delayMs] selon la cadence du [kind] : la sienne pour un retrait de conversation, la générale sinon. */
    public fun delayMs(kind: OutboxKind, failures: Int, jitterSample: Double = Math.random()): Long {
        if (kind !in conversationStateKinds) return delayMs(failures, jitterSample)
        val exponent = (maxOf(1, failures) - 1).coerceAtMost(16)
        val base = minOf(CONVERSATION_STATE_MAX_DELAY_MS, CONVERSATION_STATE_FIRST_DELAY_MS shl exponent)
        return base + (MAX_JITTER_MS * jitterSample.coerceIn(0.0, 1.0)).toLong()
    }

    /** Pause d'une ligne dont le transport a échoué : aucun essai n'est compté, donc aucun exposant ; le réseau revenu la relance avant. */
    public const val TRANSPORT_DELAY_MS: Long = 10_000L

    public fun transportDelayMs(jitterSample: Double = Math.random()): Long =
        TRANSPORT_DELAY_MS + (MAX_JITTER_MS * jitterSample.coerceIn(0.0, 1.0)).toLong()
}
