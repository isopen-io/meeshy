package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached conversation row (ARCHITECTURE.md §3, §4; ADR-004 — Room is the SoT).
 *
 * The conversation list is cached as a serialized payload plus the columns
 * needed to sort and age it. Structured columns / FTS are introduced for the
 * message store, where search requires them.
 *
 * [unreadCount] denormalizes [me.meeshy.sdk.model.ApiConversation.unreadCount]
 * out of [payload] (#5190) — kept in lockstep by every writer of this entity
 * (`ConversationCacheSource.persist`, `ConversationRepository.markReadOptimistic`
 * /`.markUnreadOptimistic`) so `ConversationDao.totalUnreadCount` can SUM it in
 * SQL instead of every caller needing the dashboard/widget total decoding and
 * summing every cached [payload] — the very shape that let a total scale with
 * the ENTIRE conversation table (up to the 10 000-conversation full-sync
 * ceiling `ConversationCacheSource` allows) rather than with the one integer
 * the total actually needs.
 */
@Entity(tableName = "conversations")
public data class ConversationEntity(
    @PrimaryKey val id: String,
    val payload: String,
    val updatedAt: Long,
    val cachedAt: Long,
    val unreadCount: Int = 0,
)
