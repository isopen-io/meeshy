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

    /**
     * Distinct anchors (`targetId`) of the rows of [kinds] still on their way — queued or in flight,
     * an exhausted row going nowhere. Live: re-emits whenever a row of the queue is written or deleted.
     */
    @Query("SELECT DISTINCT targetId FROM outbox WHERE kind IN (:kinds) AND state != 'EXHAUSTED'")
    public fun observePendingTargets(kinds: List<String>): Flow<List<String>>

    /**
     * One-shot twin of [observePendingTargets]: the anchors of the rows of [kinds] still on their
     * way, read inside the caller's transaction (a message snapshot must not undo them).
     */
    @Query("SELECT DISTINCT targetId FROM outbox WHERE kind IN (:kinds) AND state != 'EXHAUSTED'")
    public suspend fun pendingTargets(kinds: List<String>): List<String>

    @Query("SELECT * FROM outbox WHERE state = :state ORDER BY createdAt ASC")
    public suspend fun byState(state: String): List<OutboxEntity>

    @Query("SELECT * FROM outbox WHERE kind = :kind ORDER BY createdAt ASC")
    public suspend fun byKind(kind: String): List<OutboxEntity>

    /** The `(cmid, state)` of the outbox rows named by [cmids] — rows absent from the result do not exist. */
    @Query("SELECT * FROM outbox WHERE cmid IN (:cmids)")
    public suspend fun findAll(cmids: List<String>): List<OutboxEntity>

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

    /**
     * Réserve [cmid] pour un envoi : `PENDING` → `INFLIGHT` seulement si la ligne est encore `PENDING` ET due à [now]. Room
     * sérialise les écritures, donc deux passes qui se chevauchent se réduisent à deux réservations successives et une seule
     * rend 1 ; une passe qui a lu la ligne avant qu'une autre l'envoie, échoue et la remette à plus tard ne la renvoie pas
     * sur sa lecture périmée (#15541).
     */
    @Query(
        "UPDATE outbox SET state = 'INFLIGHT', updatedAt = :now WHERE cmid = :cmid AND state = 'PENDING' " +
            "AND (nextAttemptAt IS NULL OR nextAttemptAt <= :now)",
    )
    public suspend fun claimPending(cmid: String, now: Long): Int

    /** Crash-safe boot recovery: any row left INFLIGHT becomes PENDING again. */
    @Query("UPDATE outbox SET state = 'PENDING', updatedAt = :now WHERE state = 'INFLIGHT'")
    public suspend fun resetInflight(now: Long): Int

    /** [resetInflight], sparing the rows a live send of this process still holds ([live]). */
    @Query("UPDATE outbox SET state = 'PENDING', updatedAt = :now WHERE state = 'INFLIGHT' AND cmid NOT IN (:live)")
    public suspend fun resetInflightExcept(live: List<String>, now: Long): Int

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

    /** [reclaimStaleInflight], sparing the rows a live send of this process still holds ([live]) — #15541. */
    @Query(
        "UPDATE outbox SET state = 'PENDING', updatedAt = :now WHERE state = 'INFLIGHT' AND updatedAt < :staleBefore " +
            "AND cmid NOT IN (:live)",
    )
    public suspend fun reclaimStaleInflightExcept(live: List<String>, staleBefore: Long, now: Long): Int

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

    /** Holds a row back until [nextAttemptAt] (a failed attempt's backoff); its wait clock and attempts are untouched. */
    @Query("UPDATE outbox SET nextAttemptAt = :nextAttemptAt, updatedAt = :now WHERE cmid = :cmid")
    public suspend fun scheduleNext(cmid: String, nextAttemptAt: Long, now: Long)

    /** The earliest moment a held-back `PENDING` row becomes due, or `null`. */
    @Query("SELECT MIN(nextAttemptAt) FROM outbox WHERE state = 'PENDING' AND nextAttemptAt IS NOT NULL")
    public suspend fun earliestScheduledAttempt(): Long?

    @Query("SELECT EXISTS(SELECT 1 FROM outbox WHERE state IN ('PENDING', 'INFLIGHT'))")
    public suspend fun hasWork(): Boolean

    @Query("UPDATE outbox SET nextAttemptAt = NULL, waitingSince = NULL, lastError = NULL, cancelRequestedAt = NULL WHERE cmid = :cmid")
    public suspend fun resetSchedule(cmid: String)

    /**
     * #13820 — la ligne attendait le mode de sa conversation ([reason]) et vient d'être admise : son attente repart de zéro.
     * Une attente d'une autre nature (l'origine d'un transfert) garde son horloge.
     */
    @Query("UPDATE outbox SET nextAttemptAt = NULL, waitingSince = NULL, lastError = NULL, updatedAt = :now WHERE cmid = :cmid AND lastError = :reason")
    public suspend fun endWait(cmid: String, reason: String, now: Long)

    /**
     * #13820 — la file d'une conversation entre en attente de son mode derrière [cmid] : chaque ligne qui n'attend pas encore
     * attend depuis [since], ou depuis sa mise en file si elle est plus récente. La borne court pour toute la file à la fois.
     */
    @Query(
        "UPDATE outbox SET waitingSince = MAX(createdAt, :since), lastError = :reason, updatedAt = :now " +
            "WHERE lane = :lane AND cmid != :cmid AND state = 'PENDING' AND waitingSince IS NULL",
    )
    public suspend fun waitBehind(lane: String, cmid: String, since: Long, reason: String, now: Long)

    @Query("UPDATE outbox SET lastError = :error, updatedAt = :now WHERE cmid = :cmid")
    public suspend fun recordError(cmid: String, error: String?, now: Long)

    @Query("UPDATE outbox SET ownerId = :ownerId, updatedAt = :now WHERE cmid = :cmid AND ownerId IS NULL")
    public suspend fun claimIfOwnerless(cmid: String, ownerId: String, now: Long)

    @Query("UPDATE outbox SET cancelRequestedAt = :at, updatedAt = :at WHERE cmid = :cmid")
    public suspend fun requestCancel(cmid: String, at: Long)

    /** « Supprimer » : retire la ligne SAUF si un drainer l'a réservée — la condition est dans la requête, pas dans une lecture antérieure. */
    @Query("DELETE FROM outbox WHERE cmid = :cmid AND state != 'INFLIGHT'")
    public suspend fun deleteUnlessInflight(cmid: String): Int

    /** La marque d'annulation, posée seulement sur une ligne EN VOL. */
    @Query("UPDATE outbox SET cancelRequestedAt = :at, updatedAt = :at WHERE cmid = :cmid AND state = 'INFLIGHT'")
    public suspend fun requestCancelIfInflight(cmid: String, at: Long): Int

    /** Every row the table holds, whatever its state — what the capacity ceiling bounds. */
    @Query("SELECT COUNT(*) FROM outbox")
    public suspend fun count(): Int

    /** Envois encore en route (file ou vol) : ce qu'une purge de session ferait perdre. */
    @Query("SELECT COUNT(*) FROM outbox WHERE state != 'EXHAUSTED'")
    public suspend fun pendingCount(): Int

    @Query("SELECT COUNT(*) FROM outbox")
    public fun observeCount(): Flow<Int>

    @Query("DELETE FROM outbox")
    public suspend fun clear()
}
