package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.CallHistoryEntity

@Dao
public interface CallHistoryDao {

    @Query("SELECT * FROM call_history ORDER BY startedAt DESC")
    public fun observeAll(): Flow<List<CallHistoryEntity>>

    @Upsert
    public suspend fun upsertAll(rows: List<CallHistoryEntity>)

    @Query("DELETE FROM call_history WHERE callId NOT IN (:ids)")
    public suspend fun deleteNotIn(ids: List<String>)

    /**
     * Every cached call id, unordered. Backs a Kotlin-side delete-set computation
     * (`CallHistoryCacheSource.pruneMissing`) for accounts whose local cache holds
     * more rows than SQLite's bound-variable ceiling allows in a single
     * `IN (:ids)` clause (999 on API 26-29 — see [deleteByIds]). Mirrors
     * `ConversationDao.allIds`.
     */
    @Query("SELECT callId FROM call_history")
    public suspend fun allIds(): List<String>

    /**
     * Deletes by id — the caller MUST chunk [ids] to stay under SQLite's
     * `SQLITE_MAX_VARIABLE_NUMBER` (999 on API 26-29; higher on later versions,
     * but this DAO targets the lowest common floor). A single call with more
     * than that many ids throws "too many SQL variables" on device (Room binds
     * one variable per id) — this method does not chunk for you. Mirrors
     * `ConversationDao.deleteByIds`.
     */
    @Query("DELETE FROM call_history WHERE callId IN (:ids)")
    public suspend fun deleteByIds(ids: List<String>)

    @Query("DELETE FROM call_history")
    public suspend fun clear()
}
