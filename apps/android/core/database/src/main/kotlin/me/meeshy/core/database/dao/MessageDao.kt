package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.MessageEntity

@Dao
public interface MessageDao {

    /**
     * Observes a conversation's messages, oldest first. Ordering will move to
     * the server `seq` once the gateway provides it (ADR-021); until then it is
     * `createdAt`.
     */
    @Query("SELECT * FROM messages WHERE conversationId = :conversationId ORDER BY createdAt ASC")
    public fun observeForConversation(conversationId: String): Flow<List<MessageEntity>>

    @Upsert
    public suspend fun upsertAll(rows: List<MessageEntity>)

    @Query("DELETE FROM messages WHERE conversationId = :conversationId AND id NOT IN (:ids)")
    public suspend fun deleteMissing(conversationId: String, ids: List<String>)

    @Query("DELETE FROM messages WHERE conversationId = :conversationId")
    public suspend fun clearConversation(conversationId: String)

    @Query("DELETE FROM messages")
    public suspend fun clear()

    @Query("SELECT * FROM messages WHERE id = :id LIMIT 1")
    public suspend fun findById(id: String): MessageEntity?
}
