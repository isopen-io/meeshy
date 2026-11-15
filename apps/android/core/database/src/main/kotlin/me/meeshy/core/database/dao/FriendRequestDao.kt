package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.FriendRequestEntity

@Dao
public interface FriendRequestDao {

    @Query("SELECT * FROM friend_requests WHERE direction = :direction ORDER BY sortIndex ASC")
    public fun observeAll(direction: String): Flow<List<FriendRequestEntity>>

    @Upsert
    public suspend fun upsertAll(rows: List<FriendRequestEntity>)

    @Query("DELETE FROM friend_requests WHERE direction = :direction AND id NOT IN (:ids)")
    public suspend fun deleteNotIn(direction: String, ids: List<String>)

    @Query("DELETE FROM friend_requests WHERE direction = :direction")
    public suspend fun clear(direction: String)
}
