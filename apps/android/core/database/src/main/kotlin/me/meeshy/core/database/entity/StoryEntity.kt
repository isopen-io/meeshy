package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached story post row (ARCHITECTURE.md §4; ADR-004 — Room is the SoT).
 *
 * The stories feed is cached as a serialized [me.meeshy.sdk.model.ApiPost]
 * payload plus the columns needed to order the tray (`createdAt`) and age the
 * cache (`cachedAt`). Genuinely cache-first: the tray paints from these rows
 * before any network call, surviving process death — surpassing an in-memory
 * cache that empties on every cold start.
 */
@Entity(tableName = "stories")
public data class StoryEntity(
    @PrimaryKey val id: String,
    val payload: String,
    val createdAt: Long,
    val cachedAt: Long,
)
