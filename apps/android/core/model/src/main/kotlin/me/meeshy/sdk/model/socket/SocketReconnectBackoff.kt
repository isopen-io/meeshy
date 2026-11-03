package me.meeshy.sdk.model.socket

/**
 * Échelle de reconnexion exponentielle de la socket (miroir de `SocketReconnectBackoff.swift`, iOS).
 *
 * Le plafond est un plafond : le jitter est appliqué D'ABORD, le plafonnement EN DERNIER, de sorte que le
 * maximum documenté (60 s) est le maximum réel. L'échelle compte des tentatives ÉCHOUÉES, pas des pannes :
 * elle se remet au plancher à la moindre bonne nouvelle (connexion établie, réseau revenu).
 *
 * Immuable : [next] rend le délai ET l'échelle avancée ; le tirage de jitter est injecté (déterministe en test).
 */
public data class SocketReconnectBackoff(
    /** Barreaux consommés depuis la dernière remise à zéro (journal et état de lien). */
    val attempt: Int = 0,
    private val currentDelayMs: Long = FLOOR_MS,
) {
    /** Un barreau consommé : l'attente avant la prochaine tentative et l'échelle avancée. */
    public data class Step(val delayMs: Long, val backoff: SocketReconnectBackoff)

    public fun next(jitter: Double): Step {
        val jittered = (currentDelayMs * jitter.coerceAtLeast(0.0)).toLong()
        return Step(
            delayMs = minOf(jittered, CEILING_MS),
            backoff = SocketReconnectBackoff(attempt + 1, minOf(currentDelayMs * 2, CEILING_MS)),
        )
    }

    /** Une bonne nouvelle : la prochaine tentative repart du plancher. */
    public fun reset(): SocketReconnectBackoff = SocketReconnectBackoff()

    public companion object {
        public const val FLOOR_MS: Long = 1_000L
        public const val CEILING_MS: Long = 60_000L
        public const val JITTER_MIN: Double = 0.8
        public const val JITTER_SPREAD: Double = 0.4

        /** Le jitter 0,8 – 1,2 à partir d'un tirage uniforme [unit] dans [0, 1]. */
        public fun jitterOf(unit: Double): Double = JITTER_MIN + JITTER_SPREAD * unit.coerceIn(0.0, 1.0)
    }
}
