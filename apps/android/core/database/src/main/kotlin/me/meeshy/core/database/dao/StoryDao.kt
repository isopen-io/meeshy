package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.StoryEntity

@Dao
public interface StoryDao {

    @Query("SELECT * FROM stories ORDER BY createdAt DESC")
    public fun observeAll(): Flow<List<StoryEntity>>

    @Upsert
    public suspend fun upsertAll(rows: List<StoryEntity>)

    @Query("DELETE FROM stories WHERE id NOT IN (:ids)")
    public suspend fun deleteNotIn(ids: List<String>)

    @Query("DELETE FROM stories")
    public suspend fun clear()
}
