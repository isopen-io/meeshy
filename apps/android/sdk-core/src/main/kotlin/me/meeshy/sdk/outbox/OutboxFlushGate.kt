package me.meeshy.sdk.outbox

/** Ce que décide le gate réseau avant un flush. */
public sealed interface FlushGateDecision {
    /** Le réseau est là : on dispatche. */
    public data object Proceed : FlushGateDecision

    /** Hors-ligne avec du travail en attente : rien n'est dispatché, le flush revient dans [retryAfterMs]. */
    public data class RetryLater(val retryAfterMs: Long) : FlushGateDecision

    /** Hors-ligne et file vide : rien à planifier. */
    public data object Idle : FlushGateDecision
}

/**
 * Gate réseau (BW1 côté iOS) : hors-ligne, dispatcher brûlerait les essais en délais d'attente. Il rend une ÉCHÉANCE (60 s)
 * et non « rien à planifier » : le front montant du réseau reste le chemin rapide, l'échéance est le filet d'un moniteur qui
 * se trompe.
 */
public object OutboxFlushGate {
    public const val OFFLINE_RETRY_MS: Long = 60_000L

    public fun decide(online: Boolean, hasWork: Boolean): FlushGateDecision = when {
        online -> FlushGateDecision.Proceed
        hasWork -> FlushGateDecision.RetryLater(OFFLINE_RETRY_MS)
        else -> FlushGateDecision.Idle
    }
}
