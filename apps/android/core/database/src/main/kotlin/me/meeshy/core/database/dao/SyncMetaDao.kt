package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.SyncMetaEntity

@Dao
public interface SyncMetaDao {

    @Query("SELECT lastSyncedAt FROM sync_meta WHERE resourceKey = :key")
    public fun observe(key: String): Flow<Long?>

    /**
     * One-shot read of [SyncMetaEntity.contentWatermarkMillis] (#5187) — a
     * revalidation snapshots this ONCE at the start to decide delta vs. full
     * sweep, so it is a suspend function, not a [Flow]: a value that changed
     * mid-sweep must not retroactively change that decision.
     */
    @Query("SELECT contentWatermarkMillis FROM sync_meta WHERE resourceKey = :key")
    public suspend fun watermark(key: String): Long?

    /** One-shot read of [SyncMetaEntity.etag] (#5188) — see its doc-comment. */
    @Query("SELECT etag FROM sync_meta WHERE resourceKey = :key")
    public suspend fun etag(key: String): String?

    /** One-shot read of [SyncMetaEntity.etagRequestKey] (#5188) — see its doc-comment. */
    @Query("SELECT etagRequestKey FROM sync_meta WHERE resourceKey = :key")
    public suspend fun etagRequestKey(key: String): String?

    @Upsert
    public suspend fun upsert(meta: SyncMetaEntity)

    @Query("DELETE FROM sync_meta")
    public suspend fun clear()
}
