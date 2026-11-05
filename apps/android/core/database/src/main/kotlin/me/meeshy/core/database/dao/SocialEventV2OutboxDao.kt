package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.SocialEventV2OutboxEntity

@Dao
public abstract class SocialEventV2OutboxDao {

    @Upsert
    protected abstract suspend fun upsert(row: SocialEventV2OutboxEntity)

    @Query("DELETE FROM social_events_v2_outbox WHERE createdAt < :cutoff")
    protected abstract suspend fun deleteOlderThan(cutoff: Long)

    @Query(
        "DELETE FROM social_events_v2_outbox WHERE owner = :owner AND eventId IN (" +
            "SELECT eventId FROM social_events_v2_outbox WHERE owner = :owner " +
            "ORDER BY createdAt DESC, eventId DESC LIMIT -1 OFFSET :keep)",
    )
    protected abstract suspend fun trim(owner: String, keep: Int)

    /** Purge toute ligne de plus de 72 h (tous comptes) à l'instant [now]. */
    @Transaction
    public open suspend fun purgeStale(now: Long) {
        deleteOlderThan(now - RETENTION_MILLIS)
    }

    /** Enfile un événement (idempotent sur son identifiant), purge les lignes périmées, garde au plus [MAX_PER_OWNER] lignes par compte. */
    @Transaction
    public open suspend fun enqueue(row: SocialEventV2OutboxEntity, now: Long) {
        upsert(row)
        purgeStale(now)
        trim(row.owner, MAX_PER_OWNER)
    }

    /** Les plus anciens d'abord, au plus [limit], sans jamais rendre une ligne de plus de 72 h à l'instant [now]. */
    public suspend fun oldest(owner: String, limit: Int, now: Long): List<SocialEventV2OutboxEntity> =
        oldestSince(owner, limit, now - RETENTION_MILLIS)

    @Query(
        "SELECT * FROM social_events_v2_outbox WHERE owner = :owner AND createdAt >= :cutoff " +
            "ORDER BY createdAt ASC, eventId ASC LIMIT :limit",
    )
    protected abstract suspend fun oldestSince(owner: String, limit: Int, cutoff: Long): List<SocialEventV2OutboxEntity>

    @Query("SELECT COUNT(*) FROM social_events_v2_outbox WHERE owner = :owner")
    public abstract suspend fun count(owner: String): Int

    @Query("SELECT COUNT(*) FROM social_events_v2_outbox WHERE owner = :owner")
    public abstract fun observeCount(owner: String): Flow<Int>

    @Query("DELETE FROM social_events_v2_outbox WHERE owner = :owner AND eventId IN (:eventIds)")
    protected abstract suspend fun deleteChunk(owner: String, eventIds: List<String>)

    @Transaction
    public open suspend fun delete(owner: String, eventIds: List<String>) {
        eventIds.chunked(DELETE_CHUNK).forEach { deleteChunk(owner, it) }
    }

    @Query("DELETE FROM social_events_v2_outbox WHERE owner = :owner")
    public abstract suspend fun deleteOwner(owner: String)

    @Query("DELETE FROM social_events_v2_outbox")
    public abstract suspend fun clear()

    public companion object {
        public const val MAX_PER_OWNER: Int = 5_000
        public const val RETENTION_MILLIS: Long = 72L * 60 * 60 * 1000
        private const val DELETE_CHUNK: Int = 500
    }
}
