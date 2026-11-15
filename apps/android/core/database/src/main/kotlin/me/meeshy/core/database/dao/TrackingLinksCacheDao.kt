package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.TrackingLinksCacheEntity

@Dao
public interface TrackingLinksCacheDao {

    @Query("SELECT * FROM tracking_links_cache WHERE cacheKey = :key")
    public fun observe(key: String): Flow<TrackingLinksCacheEntity?>

    @Query("SELECT * FROM tracking_links_cache WHERE cacheKey = :key")
    public suspend fun get(key: String): TrackingLinksCacheEntity?

    @Upsert
    public suspend fun upsert(row: TrackingLinksCacheEntity)

    @Query("DELETE FROM tracking_links_cache WHERE cacheKey = :key")
    public suspend fun deleteByKey(key: String)

    @Query("DELETE FROM tracking_links_cache")
    public suspend fun clear()
}
