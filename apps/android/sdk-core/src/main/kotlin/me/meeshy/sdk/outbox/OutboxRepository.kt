package me.meeshy.sdk.outbox

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.ObjectIdGuard
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

    /**
     * Rows of one lane the drainer may attempt NOW, oldest first: not exhausted, and not
     * [held][OutboxLocalTargets] behind a local id. A held row is invisible here — it is neither
     * sent to a route that cannot address it nor charged an attempt — but remains owed
     * ([hasDeliverable]) until [resolveLocalId] gives it the server's id.
     */
    suspend fun deliverable(lane: String): List<OutboxEntity> =
        outboxDao.deliverableForLane(lane).filterNot { OutboxLocalTargets.isHeld(it) }

    /**
     * The local id [localId] (`cid_`, `cmid_`, `pending_`) now has its server id: every still
     * `PENDING` row that was waiting on it is re-addressed to [serverId] and becomes deliverable
     * with its attempt budget untouched. The graft is a transaction, so the drainer never reads
     * a half-rewritten queue.
     *
     * Refused (returns 0, nothing written) unless [localId] is a local id and [serverId] a real
     * ObjectId — a "resolution" to another local id would only move the problem.
     *
     * @return how many rows were re-addressed.
     */
    suspend fun resolveLocalId(localId: String, serverId: String): Int {
        if (!ObjectIdGuard.isLocalId(localId) || !ObjectIdGuard.isValid(serverId)) return 0
        return database.withTransaction {
            val waiting = outboxDao.byState(OutboxState.PENDING.name).filter { it.targetId == localId }
            val at = now()
            waiting.forEach { outboxDao.upsert(it.copy(targetId = serverId, updatedAt = at)) }
            waiting.size
        }
    }

    /**
     * The local entity [localId] will never exist server-side (its publish was discarded or
     * gave up): the `PENDING` rows still waiting on it can never be delivered, so they leave the
     * queue instead of waiting forever. Each is signalled [OutboxOutcome.Cancelled] so the
     * optimistic flip that enqueued it rolls back.
     *
     * @return how many rows were cancelled.
     */
    suspend fun cancelHeldFor(localId: String): Int {
        if (!ObjectIdGuard.isLocalId(localId)) return 0
        val cancelled = database.withTransaction {
            val waiting = outboxDao.byState(OutboxState.PENDING.name)
                .filter { it.targetId == localId && OutboxLocalTargets.isHeld(it) }
            outboxDao.deleteAll(waiting.map { it.cmid })
            waiting.map { it.cmid }
        }
        cancelled.forEach { emit(OutboxOutcome.Cancelled(it)) }
        return cancelled.size
    }

    /**
     * Whether this device still owes the server a [kind] write on [lane] — enqueued and
     * neither delivered (a delivered row is deleted) nor exhausted.
     *
     * Read by anything that would otherwise fold a SERVER value onto a device-local store:
     * a `true` here means the local copy is NEWER than what a read would return, and
     * overwriting it would silently revert the user's own change. See
     * `PreferencesSyncCoordinator`.
     */
    suspend fun hasDeliverable(lane: String, kind: OutboxKind): Boolean =
        outboxDao.hasDeliverableOfKind(lane, kind.name)

    /**
     * Distinct per-conversation message lanes ([OutboxLanes.forMessage]) currently holding at
     * least one non-exhausted row, oldest-holding-lane first. [OutboxFlushWorker] discovers
     * which dynamic lanes to drain from this on every pass — a lane's concrete id is only known
     * at enqueue time, unlike [OutboxLaneMap.sharedDrainLanes]'s fixed shared lanes.
     */
    suspend fun activeMessageLanes(): List<String> = outboxDao.activeMessageLanes()

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
