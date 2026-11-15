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
 * @property nextAttemptAt epoch ms before which the flusher must not retry the row (backoff); null = due now.
 * @property lastError last failure reason, kept for the user-facing "failed" row; null = none yet.
 * @property waitingSince epoch ms a deferred row first started waiting on an external condition; null = not waiting.
 * @property cancelRequestedAt epoch ms the user asked to cancel while the row was in flight; null = not requested.
 * @property ownerId account that enqueued the row; null = written before the column existed (never sent).
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
    val nextAttemptAt: Long? = null,
    val lastError: String? = null,
    val waitingSince: Long? = null,
    val cancelRequestedAt: Long? = null,
    val ownerId: String? = null,
)
