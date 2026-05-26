package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A durable offline mutation awaiting delivery (ARCHITECTURE.md §5; ADR-006).
 *
 * One table, drained in independent lanes so a stuck row never head-of-line
 * blocks unrelated mutations. A succeeded mutation is deleted, not flagged.
 *
 * @property cmid client mutation id — primary key and gateway dedup key.
 * @property lane drain lane, e.g. `message:<conversationId>`, `reaction`.
 * @property kind the [me.meeshy.core.database] mutation kind name.
 * @property targetId coalescing key (a `cid`, `messageId:emoji`, conversationId…).
 * @property dependsOn `cmid` of a prerequisite (e.g. a media upload) or null.
 */
@Entity(
    tableName = "outbox",
    indices = [Index("lane"), Index("state")],
)
public data class OutboxEntity(
    @PrimaryKey val cmid: String,
    val lane: String,
    val kind: String,
    val targetId: String,
    val payload: String,
    val dependsOn: String?,
    val attempts: Int,
    val state: String,
    val createdAt: Long,
    val updatedAt: Long,
)
