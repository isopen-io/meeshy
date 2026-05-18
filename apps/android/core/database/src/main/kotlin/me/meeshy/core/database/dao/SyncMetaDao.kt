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

    @Upsert
    public suspend fun upsert(meta: SyncMetaEntity)

    @Query("DELETE FROM sync_meta")
    public suspend fun clear()
}
