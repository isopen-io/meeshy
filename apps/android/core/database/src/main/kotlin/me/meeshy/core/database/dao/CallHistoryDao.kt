package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.CallHistoryEntity

@Dao
public interface CallHistoryDao {

    @Query("SELECT * FROM call_history ORDER BY startedAt DESC")
    public fun observeAll(): Flow<List<CallHistoryEntity>>

    @Upsert
    public suspend fun upsertAll(rows: List<CallHistoryEntity>)

    @Query("DELETE FROM call_history WHERE callId NOT IN (:ids)")
    public suspend fun deleteNotIn(ids: List<String>)

    @Query("DELETE FROM call_history")
    public suspend fun clear()
}
