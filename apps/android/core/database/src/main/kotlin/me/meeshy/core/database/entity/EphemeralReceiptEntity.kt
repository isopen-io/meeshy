package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Local reception clock of an ephemeral message (tpm-ephemeral-deadline-schedule).
 * The deadline is armed from the FIRST reception, so [receivedAt] only ever moves
 * forward and a replay of the same message never re-arms or rewinds it.
 */
@Entity(
    tableName = "ephemeral_receipts",
    indices = [Index("conversationId")],
)
public data class EphemeralReceiptEntity(
    @PrimaryKey val messageId: String,
    val conversationId: String,
    val receivedAt: Long,
    val expiresAt: Long?,
)
