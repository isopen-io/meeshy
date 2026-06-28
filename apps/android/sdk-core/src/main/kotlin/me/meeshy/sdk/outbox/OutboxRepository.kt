package me.meeshy.sdk.outbox

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.core.database.entity.OutboxEntity
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The durable offline-mutation queue (ARCHITECTURE.md §5; ADR-006).
 *
 * Enqueue applies in-queue coalescing transactionally; delivery itself is the
 * `WorkManager` flusher's job. Per-`cmid` outcomes drive optimistic rollback.
 */
@Singleton
class OutboxRepository @Inject constructor(
    private val database: MeeshyDatabase,
    private val outboxDao: OutboxDao,
) {
    private val _outcomes = MutableSharedFlow<OutboxOutcome>(extraBufferCapacity = 128)

    /** Per-`cmid` delivery outcomes — drives optimistic rollback in the UI. */
    val outcomes: SharedFlow<OutboxOutcome> = _outcomes.asSharedFlow()

    /** Observes the whole queue (oldest first) — for a failed-message / pending UI. */
    fun observeAll(): Flow<List<OutboxEntity>> = outboxDao.observeAll()

    /**
     * Enqueues [mutation], coalescing it against the pending lane.
     * @return the persisted row's `cmid`, or `null` if it annihilated existing rows.
     */
    suspend fun enqueue(mutation: OutboxMutation): String? {
        val incoming = mutation.toEntity(now())
        val decision = database.withTransaction {
            val pending = outboxDao.deliverableForLane(incoming.lane)
                .filter { it.stateEnum == OutboxState.PENDING }
            OutboxCoalescer.decide(incoming, pending).also { apply(it) }
        }
        return when (decision) {
            is CoalesceDecision.Enqueue -> decision.row.cmid
            is CoalesceDecision.Replace -> {
                decision.supersededCmids.forEach { emit(OutboxOutcome.Superseded(it)) }
                decision.row.cmid
            }
            is CoalesceDecision.Annihilate -> {
                decision.cancelledCmids.forEach { emit(OutboxOutcome.Cancelled(it)) }
                null
            }
        }
    }

    /** Still-deliverable rows of one lane, oldest first. */
    suspend fun deliverable(lane: String): List<OutboxEntity> = outboxDao.deliverableForLane(lane)

    /**
     * Current [OutboxState] of [cmid], or `null` when the row is gone (delivered
     * and deleted, or discarded). Used by the drainer to resolve a `dependsOn`
     * gate across lanes — a prerequisite need not share the dependent's lane.
     */
    suspend fun stateOf(cmid: String): OutboxState? = outboxDao.find(cmid)?.stateEnum

    suspend fun markInflight(cmid: String) {
        val row = outboxDao.find(cmid) ?: return
        outboxDao.updateState(cmid, OutboxState.INFLIGHT.name, row.attempts, now())
    }

    /** A successful delivery removes the row and signals [OutboxOutcome.Succeeded]. */
    suspend fun markSucceeded(cmid: String) {
        outboxDao.deleteAll(listOf(cmid))
        emit(OutboxOutcome.Succeeded(cmid))
    }

    /**
     * Records a failed attempt: back to `PENDING` for another try, or `EXHAUSTED`
     * (with an [OutboxOutcome.Exhausted] signal) once [MAX_ATTEMPTS] is reached.
     */
    suspend fun markFailed(cmid: String): OutboxState {
        val row = outboxDao.find(cmid) ?: return OutboxState.PENDING
        val attempts = row.attempts + 1
        return if (attempts >= MAX_ATTEMPTS) {
            outboxDao.updateState(cmid, OutboxState.EXHAUSTED.name, attempts, now())
            emit(OutboxOutcome.Exhausted(cmid, "Exceeded $MAX_ATTEMPTS delivery attempts"))
            OutboxState.EXHAUSTED
        } else {
            outboxDao.updateState(cmid, OutboxState.PENDING.name, attempts, now())
            OutboxState.PENDING
        }
    }

    /** A permanent (non-retryable) failure — exhaust immediately, ignoring the attempt count. */
    suspend fun markExhausted(cmid: String, reason: String) {
        val row = outboxDao.find(cmid) ?: return
        outboxDao.updateState(cmid, OutboxState.EXHAUSTED.name, row.attempts, now())
        emit(OutboxOutcome.Exhausted(cmid, reason))
    }

    /**
     * Revives an `EXHAUSTED` row for a user-initiated retry: back to `PENDING`
     * with a fresh attempt budget. Returns `false` when the row no longer exists.
     */
    suspend fun retry(cmid: String): Boolean {
        if (outboxDao.find(cmid) == null) return false
        outboxDao.updateState(cmid, OutboxState.PENDING.name, 0, now())
        return true
    }

    /**
     * Removes a row outright — a user **discarding** a permanently-failed mutation
     * (e.g. an exhausted story publish they no longer want to retry). Unknown
     * `cmid`s are a no-op. Unlike [markSucceeded] this signals no outcome: it is a
     * deliberate user removal, not a delivery.
     */
    suspend fun discard(cmid: String) {
        outboxDao.deleteAll(listOf(cmid))
    }

    /**
     * Grafts a delivered prerequisite's outcome into its still-queued dependents
     * (ARCHITECTURE.md §5) — the second half of the durable upload→publish chain.
     * For every **`PENDING`** row whose `dependsOn` is [prerequisiteCmid], [rewrite]
     * is applied to its payload; a non-`null` result is persisted, a `null` result
     * (no-op) leaves the row untouched. `INFLIGHT`/`EXHAUSTED` dependents are skipped
     * — only a row that has not yet started delivery can safely have its payload
     * rewritten. The generic `(payload) -> payload?` shape keeps the queue agnostic
     * of any one mutation's payload format.
     *
     * @return how many dependents were actually rewritten.
     */
    suspend fun rewriteDependents(prerequisiteCmid: String, rewrite: (String) -> String?): Int {
        val dependents = outboxDao.findDependents(OutboxDependencyKey.likePattern(prerequisiteCmid))
            .filter { it.stateEnum == OutboxState.PENDING }
        var changed = 0
        for (row in dependents) {
            val newPayload = rewrite(row.payload) ?: continue
            outboxDao.updatePayload(row.cmid, newPayload, now())
            changed++
        }
        return changed
    }

    /** Crash-safe boot recovery (ARCHITECTURE.md §5) — any orphaned `INFLIGHT` row becomes `PENDING`. */
    suspend fun recoverInflight(): Int = outboxDao.resetInflight(now())

    private suspend fun apply(decision: CoalesceDecision) {
        when (decision) {
            is CoalesceDecision.Enqueue -> outboxDao.upsert(decision.row)
            is CoalesceDecision.Replace -> {
                outboxDao.deleteAll(decision.supersededCmids)
                outboxDao.upsert(decision.row)
            }
            is CoalesceDecision.Annihilate -> outboxDao.deleteAll(decision.cancelledCmids)
        }
    }

    private fun emit(outcome: OutboxOutcome) {
        _outcomes.tryEmit(outcome)
    }

    private fun now(): Long = System.currentTimeMillis()

    companion object {
        const val MAX_ATTEMPTS: Int = 5
    }
}
