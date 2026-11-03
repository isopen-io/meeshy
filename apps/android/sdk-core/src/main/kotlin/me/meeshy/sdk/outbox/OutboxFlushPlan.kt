package me.meeshy.sdk.outbox

/**
 * The WorkManager outcome of one [OutboxFlushWorker] pass.
 *
 * [RETRY] reschedules the worker (WorkManager applies its backoff) so a dependent
 * still held by a `dependsOn` gate gets another pass once its prerequisite lands.
 */
public enum class FlushOutcome { SUCCESS, RETRY }

/**
 * Decides whether a flush pass must be retried, from the [DrainReport]s of every
 * lane it drained (ARCHITECTURE.md §5; ADR-006).
 *
 * A pass is retried when **any** lane stopped on:
 * - a **transient failure** — FIFO held the lane, so the failing row must be re-sent; or
 * - a **blocked dependency** — a dependent whose `dependsOn` prerequisite was still
 *   queued this pass. Because lanes drain in a fixed order, that prerequisite can be
 *   delivered *later in the very same pass* (e.g. an `UPLOAD_MEDIA` row drained after
 *   the message/story lane that gates on it). Without a retry, the now-satisfiable
 *   dependent would sit until an unrelated trigger fires. Retrying guarantees forward
 *   progress: the next pass either delivers the dependent, or cascade-exhausts it once
 *   the prerequisite gives up (an `EXHAUSTED` prerequisite flips the verdict to
 *   `FAILED`, never `BLOCKED`), so the loop always terminates.
 *
 * - **held-back rows** — an independent lane ([OutboxLanes.isIndependent]) drained past uploads waiting for their
 *   conversation's mode or not yet due again (#13820): they are owed another pass, bounded by
 *   [OutboxDrainer.DEFERRED_MAX_WAIT_MS], after which they are exhausted.
 *
 * A pass with none of these signals succeeds — every queued row was delivered or exhausted.
 */
public object OutboxFlushPlan {
    public fun outcome(reports: Iterable<DrainReport>): FlushOutcome =
        if (reports.any { it.stoppedOnTransientFailure || it.stoppedOnBlockedDependency || it.heldBack }) {
            FlushOutcome.RETRY
        } else {
            FlushOutcome.SUCCESS
        }
}

/** What the worker does after a pass: stop, or plan its own next pass. */
public sealed interface FlushNext {
    public data object Done : FlushNext

    public data class RunAfter(val delayMs: Long) : FlushNext
}

/**
 * Per-row scheduling replaces the global `Result.retry()`: a row in backoff holds its own lane only, and the worker plans
 * its next pass at the earliest moment a row becomes due (never sooner than [MIN_DELAY_MS]). A lane that stopped on a
 * dependency, or past held-back rows, with no row scheduled comes back after [OutboxDrainer.DEFERRED_RETRY_MS].
 */
public object OutboxFlushNext {
    public const val MIN_DELAY_MS: Long = 1_000L

    public fun after(reports: Iterable<DrainReport>, earliestScheduledAt: Long?, now: Long): FlushNext {
        val owed = reports.any { it.stoppedOnTransientFailure || it.stoppedOnBlockedDependency || it.heldBack }
        val untilDue = earliestScheduledAt?.let { (it - now).coerceAtLeast(MIN_DELAY_MS) }
        return when {
            untilDue != null -> FlushNext.RunAfter(untilDue)
            owed -> FlushNext.RunAfter(OutboxDrainer.DEFERRED_RETRY_MS)
            else -> FlushNext.Done
        }
    }
}
