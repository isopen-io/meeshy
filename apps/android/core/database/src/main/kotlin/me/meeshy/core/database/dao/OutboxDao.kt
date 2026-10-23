package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.OutboxEntity

@Dao
public interface OutboxDao {

    @Query("SELECT * FROM outbox ORDER BY createdAt ASC")
    public fun observeAll(): Flow<List<OutboxEntity>>

    /** Still-deliverable rows of one lane, oldest first (strict FIFO per lane). */
    @Query("SELECT * FROM outbox WHERE lane = :lane AND state != 'EXHAUSTED' ORDER BY createdAt ASC")
    public suspend fun deliverableForLane(lane: String): List<OutboxEntity>

    /**
     * Distinct dynamic per-conversation message lanes (`"message:<conversationId>"`, see
     * `me.meeshy.sdk.outbox.OutboxLanes.forMessage`) currently holding at least one
     * non-exhausted row, ordered by each lane's oldest row. A message lane's concrete id is
     * only known at enqueue time (unlike the fixed shared lanes), so the flush worker must
     * discover which lanes to drain rather than enumerate them ahead of time. The `'message:'`
     * prefix is duplicated from `OutboxLanes.forMessage` rather than referenced — `core:database`
     * sits below `sdk-core` in the module graph and cannot depend on it.
     */
    @Query(
        "SELECT lane FROM outbox WHERE lane LIKE 'message:%' AND state != 'EXHAUSTED' " +
            "GROUP BY lane ORDER BY MIN(createdAt) ASC",
    )
    public suspend fun activeMessageLanes(): List<String>

    /**
     * Whether one lane still owes the server a row of [kind] — a value this device has
     * changed locally and not yet managed to push.
     *
     * `EXISTS` rather than a row fetch because the only question asked of it is a boolean:
     * a reader that must decide whether to overwrite the local copy with the server's has
     * no use for the pending payload, only for the fact that one exists.
     */
    @Query(
        "SELECT EXISTS(SELECT 1 FROM outbox WHERE lane = :lane AND kind = :kind " +
            "AND state != 'EXHAUSTED')",
    )
    public suspend fun hasDeliverableOfKind(lane: String, kind: String): Boolean

    @Query("SELECT * FROM outbox WHERE state = :state ORDER BY createdAt ASC")
    public suspend fun byState(state: String): List<OutboxEntity>

    @Query("SELECT * FROM outbox WHERE cmid = :cmid")
    public suspend fun find(cmid: String): OutboxEntity?

    /**
     * Rows that hold a given prerequisite among their (possibly multi-valued)
     * `dependsOn` set, oldest first. [pattern] is a `LIKE` membership pattern built
     * by `OutboxDependencyKey.likePattern`; `ESCAPE '\'` keeps a `cmid`'s `_`
     * literal.
     */
    @Query("SELECT * FROM outbox WHERE dependsOn LIKE :pattern ESCAPE '\\' ORDER BY createdAt ASC")
    public suspend fun findDependents(pattern: String): List<OutboxEntity>

    @Query("UPDATE outbox SET payload = :payload, updatedAt = :now WHERE cmid = :cmid")
    public suspend fun updatePayload(cmid: String, payload: String, now: Long)

    @Upsert
    public suspend fun upsert(row: OutboxEntity)

    @Query("DELETE FROM outbox WHERE cmid IN (:cmids)")
    public suspend fun deleteAll(cmids: List<String>)

    @Query("UPDATE outbox SET state = :state, attempts = :attempts, updatedAt = :now WHERE cmid = :cmid")
    public suspend fun updateState(cmid: String, state: String, attempts: Int, now: Long)

    /** Crash-safe boot recovery: any row left INFLIGHT becomes PENDING again. */
    @Query("UPDATE outbox SET state = 'PENDING', updatedAt = :now WHERE state = 'INFLIGHT'")
    public suspend fun resetInflight(now: Long): Int

    /**
     * Rows the flusher may attempt at [now]: `PENDING`, and either never scheduled or whose
     * `nextAttemptAt` has come. Oldest first, so per-lane FIFO still holds.
     */
    @Query(
        "SELECT * FROM outbox WHERE state = 'PENDING' AND (nextAttemptAt IS NULL OR nextAttemptAt <= :now) " +
            "ORDER BY createdAt ASC",
    )
    public suspend fun due(now: Long): List<OutboxEntity>

    /**
     * Crash-safe reclaim of rows stuck `INFLIGHT` since before [staleBefore] (a worker killed
     * mid-send): back to `PENDING`. A row still being sent right now is younger and left alone.
     */
    @Query("UPDATE outbox SET state = 'PENDING', updatedAt = :now WHERE state = 'INFLIGHT' AND updatedAt < :staleBefore")
    public suspend fun reclaimStaleInflight(staleBefore: Long, now: Long): Int

    /** Rows the "Synchronisation…" indicator counts: not exhausted, minus the background [excludedKinds]. */
    @Query("SELECT COUNT(*) FROM outbox WHERE state != 'EXHAUSTED' AND kind NOT IN (:excludedKinds)")
    public fun observeActiveCount(excludedKinds: List<String>): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox WHERE state != 'EXHAUSTED' AND kind NOT IN (:excludedKinds)")
    public suspend fun activeCount(excludedKinds: List<String>): Int

    /** Head of the queue for the sync pill, oldest first, capped at [limit] (50 on iOS). */
    @Query("SELECT * FROM outbox WHERE kind NOT IN (:excludedKinds) ORDER BY createdAt ASC LIMIT :limit")
    public fun observeTop(excludedKinds: List<String>, limit: Int): Flow<List<OutboxEntity>>

    /** Terminal rows that gave up before [cutoff] — the garbage-collection candidates. */
    @Query("SELECT * FROM outbox WHERE state = 'EXHAUSTED' AND updatedAt < :cutoff ORDER BY updatedAt ASC")
    public suspend fun exhaustedOlderThan(cutoff: Long): List<OutboxEntity>

    /**
     * Whether a [kind] row anchored on [anchor] (its `targetId`) is still on its way — queued or
     * in flight. An exhausted row is dead and does not count: it goes nowhere without a manual retry.
     */
    @Query("SELECT EXISTS(SELECT 1 FROM outbox WHERE kind = :kind AND targetId = :anchor AND state != 'EXHAUSTED')")
    public suspend fun hasUnsentRow(kind: String, anchor: String): Boolean

    /** Every row [ownerId] enqueued, oldest first. */
    @Query("SELECT * FROM outbox WHERE ownerId = :ownerId ORDER BY createdAt ASC")
    public suspend fun byOwner(ownerId: String): List<OutboxEntity>

    /** Reschedules a row without charging an attempt (a deferred transfer). */
    @Query(
        "UPDATE outbox SET state = 'PENDING', nextAttemptAt = :nextAttemptAt, waitingSince = :waitingSince, " +
            "updatedAt = :now WHERE cmid = :cmid",
    )
    public suspend fun defer(cmid: String, nextAttemptAt: Long, waitingSince: Long, now: Long)

    @Query("UPDATE outbox SET nextAttemptAt = NULL, waitingSince = NULL, lastError = NULL, cancelRequestedAt = NULL WHERE cmid = :cmid")
    public suspend fun resetSchedule(cmid: String)

    @Query("UPDATE outbox SET lastError = :error, updatedAt = :now WHERE cmid = :cmid")
    public suspend fun recordError(cmid: String, error: String?, now: Long)

    @Query("UPDATE outbox SET ownerId = :ownerId, updatedAt = :now WHERE cmid = :cmid AND ownerId IS NULL")
    public suspend fun claimIfOwnerless(cmid: String, ownerId: String, now: Long)

    @Query("UPDATE outbox SET cancelRequestedAt = :at, updatedAt = :at WHERE cmid = :cmid")
    public suspend fun requestCancel(cmid: String, at: Long)

    @Query("DELETE FROM outbox")
    public suspend fun clear()
}
