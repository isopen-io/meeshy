package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.BlockedUserEntity

@Dao
public interface BlockedUserDao {

    @Query("SELECT * FROM blocked_users ORDER BY sortIndex ASC")
    public fun observeAll(): Flow<List<BlockedUserEntity>>

    @Upsert
    public suspend fun upsertAll(rows: List<BlockedUserEntity>)

    @Query("DELETE FROM blocked_users WHERE userId NOT IN (:ids)")
    public suspend fun deleteNotIn(ids: List<String>)

    @Query("DELETE FROM blocked_users")
    public suspend fun clear()
}
