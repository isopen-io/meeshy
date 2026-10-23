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

    /**
     * A non-retryable failure — 4xx (other than 404), validation.
     *
     * @property unreadable the row's own payload cannot be decoded: it can never succeed, so the
     *   drainer deletes it once the outcome is published instead of keeping a dead row.
     */
    public data class PermanentFailure(val reason: String, val unreadable: Boolean = false) : SendResult

    /**
     * Not ready yet and not at fault — e.g. the origin of a transfer is not delivered. Costs no
     * attempt: the row waits (bounded by [OutboxDrainer.DEFERRED_MAX_WAIT_MS]) and is exhausted
     * cleanly beyond it.
     */
    public data class Deferred(val reason: String) : SendResult
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
 * and the drain continues; an unreadable payload is deleted after its outcome is published.
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
 *
 * [currentOwner], when set, enforces [OutboxAuthorGuard]: a row never leaves under another
 * account than its author — it is skipped (no attempt charged) until its author is signed in.
 * A [SendResult.Deferred] row costs no attempt either: it is rescheduled and holds its lane.
 */
public class OutboxDrainer(
    private val outbox: OutboxRepository,
    private val senders: Map<OutboxKind, MutationSender>,
    private val onExhausted: suspend (OutboxEntity) -> Unit = {},
    private val graftProducedId: (payload: String, placeholder: String, realId: String) -> String? =
        { _, _, _ -> null },
    private val currentOwner: (() -> String?)? = null,
    private val now: () -> Long = System::currentTimeMillis,
) {
    public suspend fun drainLane(lane: String): DrainReport {
        var delivered = 0
        var exhausted = 0
        val pending = outbox.deliverable(lane).filter { it.stateEnum == OutboxState.PENDING }

        for (row in pending) {
            val kind = row.kindEnum ?: continue
            if (currentOwner != null) {
                when (OutboxAuthorGuard.verdict(row.ownerId, currentOwner.invoke())) {
                    AuthorVerdict.SEND -> Unit
                    AuthorVerdict.WAIT -> continue
                    AuthorVerdict.EXHAUST_NO_AUTHOR -> {
                        outbox.markExhausted(row.cmid, OutboxAuthorGuard.REASON_NO_AUTHOR)
                        onExhausted(row)
                        exhausted++
                        continue
                    }
                }
            }
            if ((row.nextAttemptAt ?: 0L) > now()) return blocked(delivered, exhausted)
            val prerequisites = OutboxDependencyKey.decode(row.dependsOn)
            if (prerequisites.isNotEmpty()) {
                val states = prerequisites.map { outbox.stateOf(it) }
                when (OutboxDependencies.verdictAll(states)) {
                    DependencyVerdict.BLOCKED -> return blocked(delivered, exhausted)
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
            val sender = senders[kind]
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
                    if (outbox.markFailed(row.cmid, "Transient delivery failure") == OutboxState.EXHAUSTED) {
                        onExhausted(row)
                        exhausted++
                    }
                    return DrainReport(delivered, exhausted, stoppedOnTransientFailure = true)
                }
                is SendResult.Deferred -> {
                    if (outbox.defer(row.cmid, result.reason, DEFERRED_RETRY_MS, DEFERRED_MAX_WAIT_MS)) {
                        return blocked(delivered, exhausted)
                    }
                    onExhausted(row)
                    exhausted++
                }
                is SendResult.PermanentFailure -> {
                    if (result.unreadable) {
                        outbox.discardUnreadable(row.cmid, result.reason)
                    } else {
                        outbox.markExhausted(row.cmid, result.reason)
                    }
                    onExhausted(row)
                    exhausted++
                }
            }
        }
        return DrainReport(delivered, exhausted, stoppedOnTransientFailure = false)
    }

    private fun blocked(delivered: Int, exhausted: Int) = DrainReport(
        delivered,
        exhausted,
        stoppedOnTransientFailure = false,
        stoppedOnBlockedDependency = true,
    )

    public companion object {
        /** How long a deferred row waits before the drainer looks at it again. */
        public const val DEFERRED_RETRY_MS: Long = 15_000L

        /** Beyond this, a row that is still deferred gives up (an origin that never arrives). */
        public const val DEFERRED_MAX_WAIT_MS: Long = 60 * 60 * 1000L
    }
}
