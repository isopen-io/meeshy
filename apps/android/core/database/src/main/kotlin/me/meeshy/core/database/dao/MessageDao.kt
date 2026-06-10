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

    @Query("SELECT * FROM messages WHERE id = :id")
    public suspend fun find(id: String): MessageEntity?

    @Upsert
    public suspend fun upsertAll(rows: List<MessageEntity>)

    /**
     * Prunes server rows absent from the latest sync. Optimistic local rows
     * (`sendState` non-null) are never pruned — the server does not know them yet.
     */
    @Query(
        "DELETE FROM messages WHERE conversationId = :conversationId " +
            "AND sendState IS NULL AND id NOT IN (:ids)",
    )
    public suspend fun deleteMissing(conversationId: String, ids: List<String>)

    @Query("UPDATE messages SET sendState = :sendState WHERE id = :id")
    public suspend fun updateSendState(id: String, sendState: String?)

    @Query("DELETE FROM messages WHERE id IN (:ids)")
    public suspend fun deleteByIds(ids: List<String>)

    @Query("DELETE FROM messages WHERE conversationId = :conversationId")
    public suspend fun clearConversation(conversationId: String)

    @Query("DELETE FROM messages")
    public suspend fun clear()
}
