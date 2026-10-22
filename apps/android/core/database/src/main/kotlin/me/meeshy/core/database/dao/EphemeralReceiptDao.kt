package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import me.meeshy.core.database.entity.EphemeralReceiptEntity

@Dao
public abstract class EphemeralReceiptDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    public abstract suspend fun insertIfAbsent(row: EphemeralReceiptEntity): Long

    @Query("UPDATE ephemeral_receipts SET receivedAt = :receivedAt WHERE messageId = :messageId AND receivedAt < :receivedAt")
    public abstract suspend fun advanceReceivedAt(messageId: String, receivedAt: Long): Int

    @Query("SELECT * FROM ephemeral_receipts WHERE messageId = :messageId")
    public abstract suspend fun find(messageId: String): EphemeralReceiptEntity?

    @Query("SELECT * FROM ephemeral_receipts WHERE conversationId = :conversationId ORDER BY receivedAt")
    public abstract suspend fun forConversation(conversationId: String): List<EphemeralReceiptEntity>

    @Query("DELETE FROM ephemeral_receipts WHERE messageId = :messageId")
    public abstract suspend fun delete(messageId: String)

    /** Idempotent and monotone: a replay is a no-op, a later reception never moves the clock back. */
    @Transaction
    public open suspend fun record(row: EphemeralReceiptEntity) {
        if (insertIfAbsent(row) == -1L) advanceReceivedAt(row.messageId, row.receivedAt)
    }
}
