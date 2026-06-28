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
 * A pass with neither signal succeeds — every queued row was delivered or exhausted.
 */
public object OutboxFlushPlan {
    public fun outcome(reports: Iterable<DrainReport>): FlushOutcome =
        if (reports.any { it.stoppedOnTransientFailure || it.stoppedOnBlockedDependency }) {
            FlushOutcome.RETRY
        } else {
            FlushOutcome.SUCCESS
        }
}
