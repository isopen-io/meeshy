package me.meeshy.sdk.outbox

import me.meeshy.core.database.entity.OutboxEntity

/** Result of delivering one outbox mutation over the network. */
public sealed interface SendResult {

    /** Delivered and acknowledged (a 404 on a delete counts as success). */
    public data object Success : SendResult

    /**
     * Delivered, and the gateway returned a server id (an upload's real `mediaId`)
     * that must be grafted into every still-queued dependent before its gate opens.
     * Accounted as a delivery exactly like [Success].
     */
    public data class SuccessWithId(val producedId: String) : SendResult

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
    val stoppedOnBlockedDependency: Boolean = false,
)

/**
 * Drains one outbox lane in strict FIFO (ARCHITECTURE.md §5; ADR-006).
 *
 * A transient failure stops the lane immediately so message ordering holds —
 * a later message is never delivered ahead of an earlier, still-failing one.
 * A permanent failure (or a kind with no registered sender) exhausts that row
 * and the drain continues.
 *
 * A row with a `dependsOn` prerequisite is gated on that prerequisite
 * ([OutboxDependencies]): a still-queued prerequisite **stops** the lane (the
 * dependent stays `PENDING` for the next pass), while an `EXHAUSTED` prerequisite
 * cascade-exhausts the dependent — it can never run. This is the durable
 * upload→publish chain primitive: a media publish waits for its upload to land
 * and is abandoned with it if the upload gives up.
 *
 * When a prerequisite delivers a [SendResult.SuccessWithId], its real id is
 * grafted into every still-queued dependent's payload via [graftProducedId]
 * (placeholder = the prerequisite's own `cmid`) **before** the row is deleted, so
 * a publish queued offline with a placeholder media id delivers with the real one.
 */
public class OutboxDrainer(
    private val outbox: OutboxRepository,
    private val senders: Map<OutboxKind, MutationSender>,
    private val onExhausted: suspend (OutboxEntity) -> Unit = {},
    private val graftProducedId: (payload: String, placeholder: String, realId: String) -> String? =
        { _, _, _ -> null },
) {
    public suspend fun drainLane(lane: String): DrainReport {
        var delivered = 0
        var exhausted = 0
        val pending = outbox.deliverable(lane).filter { it.stateEnum == OutboxState.PENDING }

        for (row in pending) {
            val prerequisites = OutboxDependencyKey.decode(row.dependsOn)
            if (prerequisites.isNotEmpty()) {
                val states = prerequisites.map { outbox.stateOf(it) }
                when (OutboxDependencies.verdictAll(states)) {
                    DependencyVerdict.BLOCKED ->
                        return DrainReport(
                            delivered,
                            exhausted,
                            stoppedOnTransientFailure = false,
                            stoppedOnBlockedDependency = true,
                        )
                    DependencyVerdict.FAILED -> {
                        val failed = prerequisites.filterIndexed { i, _ ->
                            states[i] == OutboxState.EXHAUSTED
                        }
                        outbox.markExhausted(row.cmid, "Prerequisite(s) failed: ${failed.joinToString()}")
                        onExhausted(row)
                        exhausted++
                        continue
                    }
                    DependencyVerdict.SATISFIED -> Unit
                }
            }
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
                is SendResult.SuccessWithId -> {
                    outbox.rewriteDependents(row.cmid) { payload ->
                        graftProducedId(payload, row.cmid, result.producedId)
                    }
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
