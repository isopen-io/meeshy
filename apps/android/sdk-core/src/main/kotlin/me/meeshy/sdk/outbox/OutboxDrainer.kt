package me.meeshy.sdk.outbox

import me.meeshy.core.database.entity.OutboxEntity

/** Result of delivering one outbox mutation over the network. */
public sealed interface SendResult {

    /** Delivered and acknowledged (a 404 on a delete counts as success). */
    public data object Success : SendResult

    /** A retryable failure — network down, 5xx, timeout. */
    public data object TransientFailure : SendResult

    /** A non-retryable failure — 4xx (other than 404), validation. */
    public data class PermanentFailure(val reason: String) : SendResult
}

/** Delivers a single [OutboxEntity] over the network; transient vs permanent is in the [SendResult]. */
public fun interface MutationSender {
    public suspend fun send(row: OutboxEntity): SendResult
}

/** Summary of one [OutboxDrainer.drainLane] pass. */
public data class DrainReport(
    val delivered: Int,
    val exhausted: Int,
    val stoppedOnTransientFailure: Boolean,
)

/**
 * Drains one outbox lane in strict FIFO (ARCHITECTURE.md §5; ADR-006).
 *
 * A transient failure stops the lane immediately so message ordering holds —
 * a later message is never delivered ahead of an earlier, still-failing one.
 * A permanent failure (or a kind with no registered sender) exhausts that row
 * and the drain continues.
 */
public class OutboxDrainer(
    private val outbox: OutboxRepository,
    private val senders: Map<OutboxKind, MutationSender>,
    private val onExhausted: suspend (OutboxEntity) -> Unit = {},
) {
    public suspend fun drainLane(lane: String): DrainReport {
        var delivered = 0
        var exhausted = 0
        val pending = outbox.deliverable(lane).filter { it.stateEnum == OutboxState.PENDING }

        for (row in pending) {
            val sender = senders[row.kindEnum]
            if (sender == null) {
                outbox.markExhausted(row.cmid, "No sender registered for ${row.kind}")
                onExhausted(row)
                exhausted++
                continue
            }
            outbox.markInflight(row.cmid)
            when (val result = sender.send(row)) {
                SendResult.Success -> {
                    outbox.markSucceeded(row.cmid)
                    delivered++
                }
                SendResult.TransientFailure -> {
                    if (outbox.markFailed(row.cmid) == OutboxState.EXHAUSTED) {
                        onExhausted(row)
                        exhausted++
                    }
                    return DrainReport(delivered, exhausted, stoppedOnTransientFailure = true)
                }
                is SendResult.PermanentFailure -> {
                    outbox.markExhausted(row.cmid, result.reason)
                    onExhausted(row)
                    exhausted++
                }
            }
        }
        return DrainReport(delivered, exhausted, stoppedOnTransientFailure = false)
    }
}
