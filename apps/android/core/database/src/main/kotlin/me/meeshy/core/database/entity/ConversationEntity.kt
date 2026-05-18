package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached conversation row (ARCHITECTURE.md §3, §4; ADR-004 — Room is the SoT).
 *
 * The conversation list is cached as a serialized payload plus the columns
 * needed to sort and age it. Structured columns / FTS are introduced for the
 * message store, where search requires them.
 */
@Entity(tableName = "conversations")
public data class ConversationEntity(
    @PrimaryKey val id: String,
    val payload: String,
    val updatedAt: Long,
    val cachedAt: Long,
)
