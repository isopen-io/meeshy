package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.KeyedJsonCacheEntity

@Dao
public interface KeyedJsonCacheDao {

    @Upsert
    public suspend fun upsert(entry: KeyedJsonCacheEntity)

    @Query("SELECT * FROM keyed_json_cache WHERE namespace = :namespace AND `key` = :key")
    public fun observe(namespace: String, key: String): Flow<KeyedJsonCacheEntity?>

    @Query("SELECT * FROM keyed_json_cache WHERE namespace = :namespace AND `key` = :key")
    public suspend fun find(namespace: String, key: String): KeyedJsonCacheEntity?

    @Query("DELETE FROM keyed_json_cache WHERE namespace = :namespace AND `key` = :key")
    public suspend fun delete(namespace: String, key: String)

    @Query("DELETE FROM keyed_json_cache WHERE namespace = :namespace")
    public suspend fun deleteNamespace(namespace: String)
}
