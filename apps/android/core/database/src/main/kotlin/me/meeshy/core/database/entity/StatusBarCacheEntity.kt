package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached mood-statuses bar payload for cold-launch paint (ARCHITECTURE.md §4;
 * ADR-004 — Room is the SoT). The statuses bar renders the last-fetched feed from
 * this row before any network call, so a returning user sees the bar instantly
 * across a process death — the disk (L2) tier of the iOS `CacheCoordinator.statuses`
 * (the in-memory L1 tier is [me.meeshy.core.database]'s sibling `StatusBarCache`).
 *
 * A generic keyed JSON store: [cacheKey] namespaces each feed (`statuses:friends`
 * vs `statuses:discover`) so both live in one small table. [payload] is the
 * serialized `List<me.meeshy.sdk.model.StatusEntry>`; [cachedAt] ages the row. The
 * *presence* of a row is the sync marker — an absent row is a cold (never-fetched)
 * bar, a present row holding `[]` is a real synced-empty feed, so the two never
 * collapse.
 */
@Entity(tableName = "status_bar_cache")
public data class StatusBarCacheEntity(
    @PrimaryKey val cacheKey: String,
    val payload: String,
    val cachedAt: Long,
)
