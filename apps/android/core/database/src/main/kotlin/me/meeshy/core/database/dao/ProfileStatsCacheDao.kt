package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.ProfileStatsCacheEntity

@Dao
public interface ProfileStatsCacheDao {

    @Query("SELECT * FROM profile_stats_cache WHERE cacheKey = :key")
    public fun observe(key: String): Flow<ProfileStatsCacheEntity?>

    @Upsert
    public suspend fun upsert(row: ProfileStatsCacheEntity)

    @Query("DELETE FROM profile_stats_cache WHERE cacheKey = :key")
    public suspend fun deleteByKey(key: String)

    /**
     * #18931 — the cached rows under [prefix] whose payload NAMES [needle]: a literal pre-filter (no pattern), the caller
     * confirming on the decoded payload.
     */
    @Query("SELECT * FROM profile_stats_cache WHERE substr(cacheKey, 1, length(:prefix)) = :prefix AND instr(payload, :needle) > 0")
    public suspend fun namingUnderPrefix(prefix: String, needle: String): List<ProfileStatsCacheEntity>

    @Query("DELETE FROM profile_stats_cache")
    public suspend fun clear()
}
