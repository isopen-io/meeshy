package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached profile-dashboard payload for cold-start paint (ARCHITECTURE.md §4;
 * ADR-004 — Room is the SoT). The Profile tab renders the activity stats grid and
 * the 30-day timeline sparkline from these rows before any network call, so a
 * returning user sees the dashboard instantly, cold or offline — the Android
 * analogue of the iOS `CacheCoordinator.stats` / `CacheCoordinator.timeline`.
 *
 * A generic keyed JSON store: [cacheKey] namespaces each surface (per-user stats
 * vs the me-only timeline) so both live in one small table. [payload] is the
 * serialized [me.meeshy.sdk.model.UserStats] or `List<TimelinePoint>`; [cachedAt]
 * ages the cache. The *presence* of a row is the sync marker — an absent row is a
 * cold (never-fetched) cache, a present row holding `[]` is a real synced-empty
 * timeline, so the two never collapse.
 */
@Entity(tableName = "profile_stats_cache")
public data class ProfileStatsCacheEntity(
    @PrimaryKey val cacheKey: String,
    val payload: String,
    val cachedAt: Long,
)
