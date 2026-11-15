package me.meeshy.sdk.outbox

/**
 * Le plafond de la file (miroir d'iOS `OfflineQueue.maxQueueSize` et `nearCapacity`) : 500 lignes, alerte dès 80 % (400).
 * Au plafond, un nouvel enfilage est REFUSÉ visiblement ([OutboxEnqueueResult.QueueFull]) ; une ligne n'est jamais évincée
 * en silence.
 */
public object OutboxCapacity {
    public const val MAX_ROWS: Int = 500
    public const val ALERT_ROWS: Int = MAX_ROWS * 80 / 100

    /** La raison portée par l'issue d'une mutation refusée faute de place. */
    public const val REASON_QUEUE_FULL: String = "The outbox is full"

    public fun stateFor(rowCount: Int): OutboxCapacityState = when {
        rowCount >= MAX_ROWS -> OutboxCapacityState.FULL
        rowCount >= ALERT_ROWS -> OutboxCapacityState.NEAR_CAPACITY
        else -> OutboxCapacityState.NORMAL
    }

    /** Une ligne de plus tient-elle ? */
    public fun admits(rowCount: Int): Boolean = rowCount < MAX_ROWS
}

/** Ce que l'UI lit du remplissage de la file. */
public enum class OutboxCapacityState {
    NORMAL,

    /** Au moins 80 % du plafond : l'UI prévient. */
    NEAR_CAPACITY,

    /** Plafond atteint : tout nouvel enfilage est refusé. */
    FULL,
}

/** Le résultat d'un enfilage ([OutboxRepository.tryEnqueue]). */
public sealed interface OutboxEnqueueResult {
    /** La mutation est en file sous [cmid]. */
    public data class Accepted(val cmid: String) : OutboxEnqueueResult

    /** La mutation s'est annulée avec des lignes déjà en file (envoi + suppression, bascule de réaction) : rien n'a été écrit. */
    public data object Annihilated : OutboxEnqueueResult

    /** Refus : la file compte déjà [rowCount] lignes pour un plafond de [limit]. */
    public data class QueueFull(val rowCount: Int, val limit: Int) : OutboxEnqueueResult
}
