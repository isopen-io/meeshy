package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.EditRevisionEntity

@Dao
public interface EditRevisionDao {

    @Upsert
    public suspend fun upsert(row: EditRevisionEntity)

    @Query("SELECT * FROM message_edit_revisions WHERE messageId = :messageId ORDER BY revision")
    public fun observe(messageId: String): Flow<List<EditRevisionEntity>>

    @Query("SELECT * FROM message_edit_revisions WHERE messageId = :messageId ORDER BY revision")
    public suspend fun forMessage(messageId: String): List<EditRevisionEntity>

    @Query("DELETE FROM message_edit_revisions WHERE messageId = :messageId")
    public suspend fun deleteForMessage(messageId: String)

    @Query("DELETE FROM message_edit_revisions WHERE messageId = :messageId AND revision <= :floor")
    public suspend fun deleteUpTo(messageId: String, floor: Int)

    @Query(
        "DELETE FROM message_edit_revisions WHERE messageId NOT IN (" +
            "SELECT messageId FROM message_edit_revisions GROUP BY messageId ORDER BY MAX(editedAt) DESC LIMIT :keep)",
    )
    public suspend fun keepMostRecentMessages(keep: Int)

    @Query("DELETE FROM message_edit_revisions WHERE editedAt < :cutoff")
    public suspend fun purgeOlderThan(cutoff: Long): Int
}
