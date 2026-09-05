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
}
