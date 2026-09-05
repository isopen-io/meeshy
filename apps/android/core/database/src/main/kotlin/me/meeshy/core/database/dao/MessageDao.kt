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

    /**
     * The newest [limit] rows for a conversation, most-recent first — a
     * cache-only "peek" read (hard-press preview card) that never loads a
     * conversation's full history into memory.
     */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId " +
            "ORDER BY createdAt DESC LIMIT :limit",
    )
    public suspend fun recentForConversation(conversationId: String, limit: Int): List<MessageEntity>

    /**
     * Observes a conversation's most recent [limit] rows, newest first — the
     * bounded counterpart to [observeForConversation] (#5189). The nominal
     * chat screen only needs a growing window of recent history: an
     * unbounded observe re-decodes the WHOLE conversation from SQLite on
     * every write (a reaction, a translation arriving, a read receipt),
     * however far back that history goes. Callers restore ascending order
     * themselves ([kotlin.collections.List.asReversed], the same convention
     * [recentForConversation]'s callers already use). [observeForConversation]
     * remains for legitimate full-history consumers.
     */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId " +
            "ORDER BY createdAt DESC LIMIT :limit",
    )
    public fun observeRecentForConversation(conversationId: String, limit: Int): Flow<List<MessageEntity>>

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

    /**
     * The high-water mark for a conversation's SERVER-CONFIRMED messages — MAX
     * `createdAt` among rows with no pending `sendState` (#5206). An optimistic,
     * not-yet-acked row's `createdAt` is CLIENT-assigned, never a value the
     * forward-watermark gap backfill (`GET .../messages?after=`) may safely
     * resume from — same exclusion [deleteMissingSince] already applies.
     * `null` when the conversation has no synced messages yet, in which case
     * the caller falls back to the full recent-window sync.
     */
    @Query(
        "SELECT MAX(createdAt) FROM messages WHERE conversationId = :conversationId " +
            "AND sendState IS NULL",
    )
    public suspend fun newestSyncedCreatedAt(conversationId: String): Long?

    @Query("UPDATE messages SET sendState = :sendState WHERE id = :id")
    public suspend fun updateSendState(id: String, sendState: String?)

    @Query("DELETE FROM messages WHERE id IN (:ids)")
    public suspend fun deleteByIds(ids: List<String>)

    @Query("DELETE FROM messages WHERE conversationId = :conversationId")
    public suspend fun clearConversation(conversationId: String)

    @Query("DELETE FROM messages")
    public suspend fun clear()
}
