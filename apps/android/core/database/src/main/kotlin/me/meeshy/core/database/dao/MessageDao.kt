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

    @Query("SELECT * FROM messages WHERE conversationId = :conversationId")
    public suspend fun listForConversation(conversationId: String): List<MessageEntity>

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

    /**
     * Windowed prune for the newest-page sync: only server rows inside the
     * fetched window (`createdAt >= :minCreatedAt`) can be declared deleted by
     * their absence — older paginated history is outside the page and survives.
     */
    @Query(
        "DELETE FROM messages WHERE conversationId = :conversationId " +
            "AND sendState IS NULL AND createdAt >= :minCreatedAt AND id NOT IN (:ids)",
    )
    public suspend fun deleteMissingSince(conversationId: String, minCreatedAt: Long, ids: List<String>)

    /** Oldest server-acked row — the `before` cursor for backwards pagination. */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId " +
            "AND sendState IS NULL ORDER BY createdAt ASC LIMIT 1",
    )
    public suspend fun oldestSynced(conversationId: String): MessageEntity?

    @Query("UPDATE messages SET sendState = :sendState WHERE id = :id")
    public suspend fun updateSendState(id: String, sendState: String?)

    @Query("DELETE FROM messages WHERE id IN (:ids)")
    public suspend fun deleteByIds(ids: List<String>)

    @Query("DELETE FROM messages WHERE conversationId = :conversationId")
    public suspend fun clearConversation(conversationId: String)

    @Query("DELETE FROM messages")
    public suspend fun clear()
}
