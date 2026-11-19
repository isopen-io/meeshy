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

    /**
     * Rétention — le pont d'un message supprimé, retrouvé par l'un ou l'autre de ses identifiants. Un pont que NOMME encore
     * une ligne de la file (le `copyAttachmentsFromMessageId` d'un transfert) reste : il ne porte aucun texte, et sans lui
     * le transfert ne résout plus son origine, bloque la file de sa conversation puis s'épuise (#19440).
     */
    @Query(
        "DELETE FROM pending_ids WHERE (localId IN (:ids) OR serverId IN (:ids)) AND NOT EXISTS (" +
            "SELECT 1 FROM outbox WHERE payload LIKE '%\"copyAttachmentsFromMessageId\":\"' || pending_ids.localId || '\"%')",
    )
    public suspend fun deleteForMessages(ids: List<String>)

    @Query("DELETE FROM pending_ids")
    public suspend fun clear()
}
