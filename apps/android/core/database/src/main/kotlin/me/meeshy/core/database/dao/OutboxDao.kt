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

    @Query("DELETE FROM outbox")
    public suspend fun clear()
}
