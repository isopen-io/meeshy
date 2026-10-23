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

    @Query("SELECT * FROM messages WHERE id IN (:ids)")
    public suspend fun findAll(ids: List<String>): List<MessageEntity>

    /** Third level of the id lookup: a row whose primary key is still the local id but whose server id is known. */
    @Query("SELECT * FROM messages WHERE serverId = :serverId LIMIT 1")
    public suspend fun findByServerId(serverId: String): MessageEntity?

    /** Rows written before the queryable columns existed, oldest first, for the Kotlin backfill. */
    @Query("SELECT * FROM messages WHERE columnsBackfilled = 0 ORDER BY createdAt ASC LIMIT :limit")
    public suspend fun unbackfilled(limit: Int): List<MessageEntity>

    @Query("SELECT * FROM messages WHERE conversationId = :conversationId AND pinnedAt IS NOT NULL ORDER BY pinnedAt DESC")
    public suspend fun pinned(conversationId: String): List<MessageEntity>

    /** Ephemeral rows whose deadline has passed — what the retention sweep removes. */
    @Query("SELECT * FROM messages WHERE expiresAt IS NOT NULL AND expiresAt <= :nowMillis")
    public suspend fun expiredBefore(nowMillis: Long): List<MessageEntity>

    /** The reader opened a view-once message: permanent, and invisible to a REST refresh. */
    @Query(
        "UPDATE messages SET viewOnceOpenedAt = :openedAt, changeVersion = changeVersion + 1 " +
            "WHERE id = :id AND viewOnceOpenedAt IS NULL",
    )
    public suspend fun markViewOnceOpened(id: String, openedAt: Long)

    @Query(
        "UPDATE messages SET sendState = :sendState, retryCount = :retryCount, lastError = :lastError, " +
            "changeVersion = changeVersion + 1 WHERE id = :id",
    )
    public suspend fun recordSendAttempt(id: String, sendState: String?, retryCount: Int, lastError: String?)

    @Query("SELECT COUNT(*) FROM messages WHERE columnsBackfilled = 0")
    public suspend fun countUnbackfilled(): Int

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

    @Query("UPDATE messages SET sendState = :sendState, changeVersion = changeVersion + 1 WHERE id = :id")
    public suspend fun updateSendState(id: String, sendState: String?)

    @Query("DELETE FROM messages WHERE id IN (:ids)")
    public suspend fun deleteByIds(ids: List<String>)

    @Query("DELETE FROM messages WHERE conversationId = :conversationId")
    public suspend fun clearConversation(conversationId: String)

    @Query("DELETE FROM messages")
    public suspend fun clear()
}

/**
 * Upserts server-truth rows without erasing what only this device knows (retry counter, last
 * error, opened view-once, change version). Call it inside the transaction that writes the page.
 */
public suspend fun MessageDao.upsertKeepingLocal(rows: List<MessageEntity>) {
    if (rows.isEmpty()) return
    val previous = rows.map { it.id }.chunked(ID_CHUNK).flatMap { findAll(it) }.associateBy { it.id }
    upsertAll(rows.map { it.carryingLocalColumnsOf(previous[it.id]) })
}

private const val ID_CHUNK = 500
