package me.meeshy.sdk.user

import kotlinx.coroutines.flow.first
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.dao.ProfileStatsCacheDao
import me.meeshy.core.database.entity.ProfileStatsCacheEntity
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.TimelinePoint
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.net.MeeshyApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Room-backed cold-start cache for the Profile dashboard — the Android analogue
 * of the iOS `CacheCoordinator.stats` / `CacheCoordinator.timeline`.
 *
 * The projection SSOT (`UserStatsBuilder`, `StatsTimelineBuilder`) lives in
 * `:feature:profile`; this repository only **persists** the raw
 * [me.meeshy.sdk.model.UserStats] / timeline the network returned and **replays**
 * it on the next cold launch so the dashboard paints instantly before any network
 * call (ARCHITECTURE.md §4: cache-first, network-second). It holds no network
 * dependency and no projection logic.
 *
 * Stats are keyed per **user** (viewing several profiles caches each); the
 * timeline is the signed-in user's own me-only surface, so it uses a single
 * constant key. Cold vs synced-empty is carried by row presence, not a separate
 * flag: an absent row is cold (`null`); a present row holding `[]` is a real
 * synced-empty timeline — so an empty 30-day window never re-reads as cold.
 *
 * A payload that fails to decode (schema drift, corruption) is treated as a
 * cache **miss** (`null`), never a crash — the dashboard falls back to the
 * network path exactly as if nothing were cached.
 */
@Singleton
class ProfileStatsCacheRepository @Inject constructor(
    private val dao: ProfileStatsCacheDao,
) {

    /** Last-persisted raw stats for [userId], or `null` when never cached / undecodable. */
    suspend fun cachedStats(userId: String): UserStats? {
        val payload = dao.observe(statsKey(userId)).first()?.payload ?: return null
        return runCatching { MeeshyApi.json.decodeFromString<UserStats>(payload) }.getOrNull()
    }

    /** Write the network stats for [userId] through to Room for the next cold paint. */
    suspend fun persistStats(userId: String, stats: UserStats) {
        dao.upsert(
            ProfileStatsCacheEntity(
                cacheKey = statsKey(userId),
                payload = MeeshyApi.json.encodeToString(stats),
                cachedAt = SystemCacheClock.nowMillis(),
            ),
        )
    }

    /**
     * Last-persisted own-user timeline, or `null` when never cached / undecodable.
     * A synced-empty window reads back as `emptyList()`, distinct from the cold `null`.
     */
    suspend fun cachedTimeline(): List<TimelinePoint>? {
        val payload = dao.observe(TIMELINE_KEY).first()?.payload ?: return null
        return runCatching { MeeshyApi.json.decodeFromString<List<TimelinePoint>>(payload) }.getOrNull()
    }

    /** Write the network timeline through to Room for the next cold paint. */
    suspend fun persistTimeline(points: List<TimelinePoint>) {
        dao.upsert(
            ProfileStatsCacheEntity(
                cacheKey = TIMELINE_KEY,
                payload = MeeshyApi.json.encodeToString(points),
                cachedAt = SystemCacheClock.nowMillis(),
            ),
        )
    }

    internal companion object {
        const val TIMELINE_KEY: String = "profile_timeline:me"
        fun statsKey(userId: String): String = "profile_stats:$userId"
    }
}
