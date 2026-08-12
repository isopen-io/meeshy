package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached accepted-friend row for cold-start paint (ARCHITECTURE.md §4; ADR-004 —
 * Room is the SoT). The Contacts tab renders these rows before any network call
 * so a returning user sees their friend list instantly, cold or offline — the
 * Android analogue of the iOS `CacheCoordinator.friends`.
 *
 * Each friend is stored as a serialized
 * [me.meeshy.sdk.model.FriendRequestUser] payload plus a [sortIndex] that
 * preserves the *exact* order the pure `ContactList` assembled (online-first,
 * then most-recently-active) — the DAO orders by it so the ordering SSOT stays
 * in `ContactList`, never re-implemented in SQL. [cachedAt] ages the cache.
 */
@Entity(tableName = "friends")
public data class FriendEntity(
    @PrimaryKey val userId: String,
    val payload: String,
    val sortIndex: Int,
    val cachedAt: Long,
)
