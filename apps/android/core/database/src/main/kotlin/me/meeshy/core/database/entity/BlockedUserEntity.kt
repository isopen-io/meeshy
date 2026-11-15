package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached blocked-user row for cold-start paint of the Blocked tab
 * (ARCHITECTURE.md §4; ADR-004 — Room is the SoT). Mirrors [FriendEntity]: a
 * serialized `me.meeshy.sdk.model.friend.BlockedUser` payload plus a
 * [sortIndex] preserving the exact order the gateway returned it in.
 * [cachedAt] ages the cache.
 */
@Entity(tableName = "blocked_users")
public data class BlockedUserEntity(
    @PrimaryKey val userId: String,
    val payload: String,
    val sortIndex: Int,
    val cachedAt: Long,
)
