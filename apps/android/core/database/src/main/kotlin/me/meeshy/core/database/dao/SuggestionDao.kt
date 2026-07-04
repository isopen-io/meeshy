package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.SuggestionEntity

@Dao
public interface SuggestionDao {

    @Query("SELECT * FROM discover_suggestions ORDER BY sortIndex ASC")
    public fun observeAll(): Flow<List<SuggestionEntity>>

    @Upsert
    public suspend fun upsertAll(rows: List<SuggestionEntity>)

    @Query("DELETE FROM discover_suggestions WHERE userId NOT IN (:ids)")
    public suspend fun deleteNotIn(ids: List<String>)

    @Query("DELETE FROM discover_suggestions")
    public suspend fun clear()
}
