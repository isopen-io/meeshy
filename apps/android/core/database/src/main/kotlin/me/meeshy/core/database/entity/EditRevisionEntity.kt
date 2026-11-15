package me.meeshy.core.database.entity

import androidx.room.Entity

/** One past revision of an edited message (tpm-msg-edit-history), keyed by (message, revision). */
@Entity(
    tableName = "message_edit_revisions",
    primaryKeys = ["messageId", "revision"],
)
public data class EditRevisionEntity(
    val messageId: String,
    val revision: Int,
    val content: String,
    val editedAt: Long,
)
