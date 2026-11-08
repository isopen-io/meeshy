package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.NotificationEntity

@Dao
public interface NotificationDao {

    @Query("SELECT * FROM notifications WHERE scopeKey = :scopeKey ORDER BY createdAt DESC, id DESC")
    public fun observe(scopeKey: String): Flow<List<NotificationEntity>>

    @Query("SELECT * FROM notifications WHERE scopeKey = :scopeKey ORDER BY createdAt DESC, id DESC")
    public suspend fun all(scopeKey: String): List<NotificationEntity>

    @Upsert
    public suspend fun upsertAll(rows: List<NotificationEntity>)

    @Query("DELETE FROM notifications WHERE id = :id")
    public suspend fun deleteById(id: String)

    @Query("DELETE FROM notifications WHERE scopeKey = :scopeKey")
    public suspend fun deleteScope(scopeKey: String)

    @Query("DELETE FROM notifications")
    public suspend fun clear()
}
