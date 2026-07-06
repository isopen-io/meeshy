package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.FriendEntity

@Dao
public interface FriendDao {

    @Query("SELECT * FROM friends ORDER BY sortIndex ASC")
    public fun observeAll(): Flow<List<FriendEntity>>

    @Upsert
    public suspend fun upsertAll(rows: List<FriendEntity>)

    @Query("DELETE FROM friends WHERE userId NOT IN (:ids)")
    public suspend fun deleteNotIn(ids: List<String>)

    @Query("DELETE FROM friends")
    public suspend fun clear()
}
