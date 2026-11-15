package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Media of a conversation indexed by kind, newest first (tpm-conv-media-kinds). */
@Entity(
    tableName = "media_index",
    indices = [Index("conversationId", "kind", "createdAt")],
)
public data class MediaIndexEntity(
    @PrimaryKey val attachmentId: String,
    val conversationId: String,
    val kind: String,
    val messageId: String,
    val createdAt: Long,
    val payload: String,
)
