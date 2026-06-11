package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.ConversationEntity

@Dao
public interface ConversationDao {

    @Query("SELECT * FROM conversations ORDER BY updatedAt DESC")
    public fun observeAll(): Flow<List<ConversationEntity>>

    @Query("SELECT * FROM conversations WHERE id = :id")
    public fun observeById(id: String): Flow<ConversationEntity?>

    @Upsert
    public suspend fun upsertAll(rows: List<ConversationEntity>)

    @Query("DELETE FROM conversations WHERE id NOT IN (:ids)")
    public suspend fun deleteNotIn(ids: List<String>)

    @Query("DELETE FROM conversations")
    public suspend fun clear()
}
