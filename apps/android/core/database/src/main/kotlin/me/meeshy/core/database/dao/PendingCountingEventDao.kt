package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.PendingCountingEventEntity

@Dao
public abstract class PendingCountingEventDao {

    @Upsert
    protected abstract suspend fun upsert(row: PendingCountingEventEntity)

    @Query(
        "DELETE FROM pending_counting_events WHERE owner = :owner AND queueKey = :queueKey AND eventId IN (" +
            "SELECT eventId FROM pending_counting_events WHERE owner = :owner AND queueKey = :queueKey " +
            "ORDER BY createdAt DESC, eventId DESC LIMIT -1 OFFSET :keep)",
    )
    protected abstract suspend fun trim(owner: String, queueKey: String, keep: Int)

    /** Enfile un événement (idempotent sur son identifiant) puis laisse au plus [MAX_PER_QUEUE] lignes, les plus récentes. */
    @Transaction
    public open suspend fun enqueue(row: PendingCountingEventEntity) {
        upsert(row)
        trim(row.owner, row.queueKey, MAX_PER_QUEUE)
    }

    /** Les plus anciens d'abord, au plus [limit]. */
    @Query(
        "SELECT * FROM pending_counting_events WHERE owner = :owner AND queueKey = :queueKey " +
            "ORDER BY createdAt ASC, eventId ASC LIMIT :limit",
    )
    public abstract suspend fun oldest(owner: String, queueKey: String, limit: Int): List<PendingCountingEventEntity>

    @Query("SELECT DISTINCT queueKey FROM pending_counting_events WHERE owner = :owner ORDER BY queueKey")
    public abstract suspend fun queueKeys(owner: String): List<String>

    @Query("SELECT COUNT(*) FROM pending_counting_events WHERE owner = :owner AND queueKey = :queueKey")
    public abstract suspend fun count(owner: String, queueKey: String): Int

    @Query("SELECT COUNT(*) FROM pending_counting_events WHERE owner = :owner")
    public abstract fun observeCount(owner: String): Flow<Int>

    @Query("DELETE FROM pending_counting_events WHERE owner = :owner AND eventId IN (:eventIds)")
    protected abstract suspend fun deleteChunk(owner: String, eventIds: List<String>)

    /** Retire un paquet envoyé ; découpé pour tenir sous la limite de variables de SQLite. */
    @Transaction
    public open suspend fun delete(owner: String, eventIds: List<String>) {
        eventIds.chunked(DELETE_CHUNK).forEach { deleteChunk(owner, it) }
    }

    @Query("DELETE FROM pending_counting_events WHERE owner = :owner")
    public abstract suspend fun deleteOwner(owner: String)

    @Query("DELETE FROM pending_counting_events")
    public abstract suspend fun clear()

    public companion object {
        public const val MAX_PER_QUEUE: Int = 500
        private const val DELETE_CHUNK: Int = 500
    }
}
