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

    @Query("SELECT * FROM outbox WHERE state = :state ORDER BY createdAt ASC")
    public suspend fun byState(state: String): List<OutboxEntity>

    @Query("SELECT * FROM outbox WHERE cmid = :cmid")
    public suspend fun find(cmid: String): OutboxEntity?

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
