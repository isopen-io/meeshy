package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached "discover people" suggestion row for cold-start paint (ARCHITECTURE.md
 * §4; ADR-004 — Room is the SoT). The empty-query discover list (recent-active /
 * mutual friends the gateway returns for `users/search?q=`) is rendered from
 * these rows before any network call so a returning user sees the Discover tab's
 * suggestions instantly, cold or offline — the Android analogue of the iOS
 * `CacheCoordinator.userSearch` empty-query cache, and the last in-memory-only
 * cache to go durable (mirroring `FriendEntity` / `CallHistoryEntity`).
 *
 * Each suggestion is stored as a serialized
 * [me.meeshy.sdk.net.api.UserSearchResult] payload plus a [sortIndex] that
 * preserves the *exact* order the gateway returned (the ranking SSOT stays
 * server-side — never re-derived in SQL); the DAO orders by it. [cachedAt] ages
 * the cache.
 */
@Entity(tableName = "discover_suggestions")
public data class SuggestionEntity(
    @PrimaryKey val userId: String,
    val payload: String,
    val sortIndex: Int,
    val cachedAt: Long,
)
