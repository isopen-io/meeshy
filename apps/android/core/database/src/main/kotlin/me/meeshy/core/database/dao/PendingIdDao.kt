package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import me.meeshy.core.database.entity.PendingIdEntity

@Dao
public interface PendingIdDao {

    @Upsert
    public suspend fun upsert(entity: PendingIdEntity)

    @Query("SELECT * FROM pending_ids WHERE localId = :localId")
    public suspend fun byLocalId(localId: String): PendingIdEntity?

    @Query("SELECT * FROM pending_ids WHERE serverId = :serverId LIMIT 1")
    public suspend fun byServerId(serverId: String): PendingIdEntity?

    @Query("DELETE FROM pending_ids WHERE conversationId = :conversationId")
    public suspend fun clearConversation(conversationId: String)

    @Query("DELETE FROM pending_ids")
    public suspend fun clear()
}
