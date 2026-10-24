package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.MediaIndexEntity

@Dao
public interface MediaIndexDao {

    @Upsert
    public suspend fun upsertAll(rows: List<MediaIndexEntity>)

    @Query("SELECT * FROM media_index WHERE conversationId = :conversationId AND kind = :kind ORDER BY createdAt DESC")
    public fun observe(conversationId: String, kind: String): Flow<List<MediaIndexEntity>>

    @Query("SELECT * FROM media_index WHERE conversationId = :conversationId AND kind = :kind ORDER BY createdAt DESC")
    public suspend fun list(conversationId: String, kind: String): List<MediaIndexEntity>

    @Query("DELETE FROM media_index WHERE messageId = :messageId")
    public suspend fun deleteForMessage(messageId: String)

    @Query("DELETE FROM media_index WHERE conversationId = :conversationId")
    public suspend fun deleteForConversation(conversationId: String)
}
