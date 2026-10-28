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
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.commitOrWrite
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
 * Stats AND the timeline are keyed per **user**: the timeline is the signed-in
 * user's own me-only surface, and a constant key let the next account on the
 * device paint the previous account's activity. The whole table is also a
 * [PerAccountCache], wiped on logout / account switch. Cold vs synced-empty is
 * carried by row presence, not a separate flag: an absent row is cold (`null`); a present row holding `[]` is a real
 * synced-empty timeline — so an empty 30-day window never re-reads as cold.
 *
 * A payload that fails to decode (schema drift, corruption) is treated as a
 * cache **miss** (`null`), never a crash — the dashboard falls back to the
 * network path exactly as if nothing were cached.
 */
@Singleton
class ProfileStatsCacheRepository @Inject constructor(
    private val dao: ProfileStatsCacheDao,
    private val fence: AccountFence? = null,
) : PerAccountCache {

    /** Le compte auquel appartient une requête qui part MAINTENANT (#13560) ; `null` sans garde. */
    suspend fun ticket(): AccountTicket? = fence?.currentTicket()

    /** Changement de compte : aucune statistique ni activité d'un compte ne survit sous le suivant. */
    override suspend fun clear() {
        dao.clear()
    }

    /** Last-persisted raw stats for [userId], or `null` when never cached / undecodable. */
    suspend fun cachedStats(userId: String): UserStats? {
        val payload = dao.observe(statsKey(userId)).first()?.payload ?: return null
        return runCatching { MeeshyApi.json.decodeFromString<UserStats>(payload) }.getOrNull()
    }

    /** Write the network stats for [userId] through to Room for the next cold paint. */
    suspend fun persistStats(userId: String, stats: UserStats, ticket: AccountTicket? = null) {
        fence.commitOrWrite(ticket) {
            dao.upsert(
                ProfileStatsCacheEntity(
                    cacheKey = statsKey(userId),
                    payload = MeeshyApi.json.encodeToString(stats),
                    cachedAt = SystemCacheClock.nowMillis(),
                ),
            )
        }
    }

    /** Forget [userId]'s stats (a profile that is no longer served leaves nothing behind). */
    suspend fun purgeStats(userId: String) {
        dao.deleteByKey(statsKey(userId))
    }

    /**
     * L'activité de CE compte (ma page et l'écran des statistiques) : une clé par compte, donc la fenêtre d'un
     * compte précédent ne se peint jamais sous un autre après un changement de session. `null` à froid ou
     * illisible, `emptyList()` pour une fenêtre synchronisée et vide.
     */
    suspend fun cachedTimeline(userId: String): List<TimelinePoint>? {
        val payload = dao.observe(timelineKey(userId)).first()?.payload ?: return null
        return runCatching { MeeshyApi.json.decodeFromString<List<TimelinePoint>>(payload) }.getOrNull()
    }

    suspend fun persistTimeline(userId: String, points: List<TimelinePoint>, ticket: AccountTicket? = null) {
        fence.commitOrWrite(ticket) {
            dao.deleteByKey(LEGACY_SHARED_TIMELINE_KEY)
            dao.upsert(
                ProfileStatsCacheEntity(
                    cacheKey = timelineKey(userId),
                    payload = MeeshyApi.json.encodeToString(points),
                    cachedAt = SystemCacheClock.nowMillis(),
                ),
            )
        }
    }

    internal companion object {
        fun timelineKey(userId: String): String = "profile_timeline:$userId"
        const val LEGACY_SHARED_TIMELINE_KEY: String = "profile_timeline:me"
        fun statsKey(userId: String): String = "profile_stats:$userId"
    }
}
