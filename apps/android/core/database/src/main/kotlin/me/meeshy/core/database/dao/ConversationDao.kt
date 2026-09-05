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

    /**
     * The [limit] most-recently-updated rows — a BOUNDED read for callers that
     * only ever render a handful of conversations (home-screen widgets,
     * dynamic launcher shortcuts) instead of [observeAll], which decodes every
     * cached row (#5190: up to the 10 000-conversation full-sync ceiling
     * `ConversationCacheSource` allows, to render 5-8). Ordered the same way
     * [observeAll] is — pinned-first-then-recency is a client-side re-sort
     * applied to this already-bounded window, not a column this query knows
     * about.
     */
    @Query("SELECT * FROM conversations ORDER BY updatedAt DESC LIMIT :limit")
    public suspend fun recentByUpdatedAt(limit: Int): List<ConversationEntity>

    @Query("SELECT * FROM conversations WHERE id = :id")
    public fun observeById(id: String): Flow<ConversationEntity?>

    @Query("SELECT * FROM conversations WHERE id = :id")
    public suspend fun find(id: String): ConversationEntity?

    @Upsert
    public suspend fun upsertAll(rows: List<ConversationEntity>)

    @Query("DELETE FROM conversations WHERE id NOT IN (:ids)")
    public suspend fun deleteNotIn(ids: List<String>)

    /**
     * Every cached conversation id, unordered. Backs a Kotlin-side delete-set
     * computation (`ConversationCacheSource.persist`) for accounts whose local
     * cache holds more rows than SQLite's bound-variable ceiling allows in a
     * single `IN (:ids)` clause (999 on API 26-29 — see [deleteByIds]).
     */
    @Query("SELECT id FROM conversations")
    public suspend fun allIds(): List<String>

    /**
     * Deletes by id — the caller MUST chunk [ids] to stay under SQLite's
     * `SQLITE_MAX_VARIABLE_NUMBER` (999 on API 26-29; higher on later
     * versions, but this DAO targets the lowest common floor). A single call
     * with more than that many ids throws "too many SQL variables" on device
     * (Room binds one variable per id) — this method does not chunk for you.
     */
    @Query("DELETE FROM conversations WHERE id IN (:ids)")
    public suspend fun deleteByIds(ids: List<String>)

    @Query("DELETE FROM conversations")
    public suspend fun clear()

    /**
     * The unread total across every cached conversation — a SQL `SUM`, never a
     * decode. #5190: five call sites (home-screen widgets, the dashboard badge,
     * the in-app chrome) each used to call [observeAll] and decode every
     * payload just to sum one field off each — this is the single bounded/
     * aggregate query they converge on instead. `COALESCE(..., 0)` because
     * `SUM` over zero rows is SQL `NULL`, not `0` — a cold/empty cache must
     * read as "zero unread", not "unknown".
     */
    @Query("SELECT COALESCE(SUM(unreadCount), 0) FROM conversations")
    public fun totalUnreadCount(): Flow<Int>
}
