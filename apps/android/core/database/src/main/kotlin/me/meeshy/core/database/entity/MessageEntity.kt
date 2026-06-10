package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A cached message of a conversation (ARCHITECTURE.md §4, §6; ADR-004).
 *
 * @property id server id, or the optimistic `cid` until the send is acked.
 * @property seq the per-conversation server sequence number (ADR-021) — the
 *   intended sort key; `null` until the gateway exposes it, so the list
 *   currently falls back to [createdAt] ordering.
 * @property payload the serialized `ApiMessage`.
 * @property sendState `null` for server-acked rows; `SENDING` / `FAILED` for
 *   optimistic local rows whose `id` is still the outbox `cmid`.
 */
@Entity(
    tableName = "messages",
    indices = [Index("conversationId")],
)
public data class MessageEntity(
    @PrimaryKey val id: String,
    val conversationId: String,
    val seq: Long?,
    val payload: String,
    val createdAt: Long,
    val cachedAt: Long,
    val sendState: String? = null,
)
