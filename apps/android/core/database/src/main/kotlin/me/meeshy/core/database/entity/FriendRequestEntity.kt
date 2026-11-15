package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached friend-request row for cold-start paint of the Requests tab
 * (ARCHITECTURE.md §4; ADR-004 — Room is the SoT). Mirrors [FriendEntity]: a
 * serialized `me.meeshy.sdk.model.FriendRequest` payload plus a [sortIndex]
 * preserving the exact order the gateway returned it in. A single table backs
 * both the received and sent lists — [direction] (`"received"`/`"sent"`)
 * separates them, since a request id is unique to exactly one of the two.
 * [cachedAt] ages the cache.
 */
@Entity(tableName = "friend_requests")
public data class FriendRequestEntity(
    @PrimaryKey val id: String,
    val direction: String,
    val payload: String,
    val sortIndex: Int,
    val cachedAt: Long,
)
