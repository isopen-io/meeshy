package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.StatusBarCacheEntity

@Dao
public interface StatusBarCacheDao {

    @Query("SELECT * FROM status_bar_cache WHERE cacheKey = :key")
    public fun observe(key: String): Flow<StatusBarCacheEntity?>

    @Upsert
    public suspend fun upsert(row: StatusBarCacheEntity)

    @Query("DELETE FROM status_bar_cache WHERE cacheKey = :key")
    public suspend fun deleteByKey(key: String)

    @Query("DELETE FROM status_bar_cache")
    public suspend fun clear()
}
