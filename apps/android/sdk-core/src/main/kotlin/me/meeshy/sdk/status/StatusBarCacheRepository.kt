package me.meeshy.sdk.status

import kotlinx.coroutines.flow.first
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.dao.StatusBarCacheDao
import me.meeshy.core.database.entity.StatusBarCacheEntity
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.net.MeeshyApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Room-backed cold-launch cache for the mood-statuses bar — the disk (L2) tier of the
 * iOS `CacheCoordinator.statuses`. Its in-memory sibling [StatusBarCache] serves warm
 * re-entries within the process; this repository **persists** the raw feed the network
 * returned and **replays** it on the next cold launch (surviving a process death) so the
 * bar paints instantly before any network call (ARCHITECTURE.md §4: cache-first,
 * network-second). It holds no network dependency and no product decisions — the
 * *when-to-read/write* orchestration lives in the `:feature:feed` ViewModel.
 *
 * The bar is keyed per [StatusFeedMode] (`statuses:friends` vs `statuses:discover`) so the
 * two feeds cache independently, mirroring iOS's `statuses_<mode>` cache key. Cold vs
 * synced-empty is carried by row presence, not a separate flag: an absent row is cold
 * (`null`); a present row holding `[]` is a real synced-empty feed — so an empty bar never
 * re-reads as cold.
 *
 * A payload that fails to decode (schema drift, corruption) is treated as a cache
 * **miss** (`null`), never a crash — the bar falls back to the network path exactly as if
 * nothing were cached, following [me.meeshy.sdk.user.ProfileStatsCacheRepository].
 */
@Singleton
class StatusBarCacheRepository @Inject constructor(
    private val dao: StatusBarCacheDao,
) {

    /** Last-persisted bar for [mode], or `null` when never cached / undecodable. */
    suspend fun cachedBar(mode: StatusFeedMode): List<StatusEntry>? {
        val payload = dao.observe(barKey(mode)).first()?.payload ?: return null
        return runCatching { MeeshyApi.json.decodeFromString<List<StatusEntry>>(payload) }.getOrNull()
    }

    /** Write the network bar for [mode] through to Room for the next cold paint. */
    suspend fun persistBar(mode: StatusFeedMode, statuses: List<StatusEntry>) {
        dao.upsert(
            StatusBarCacheEntity(
                cacheKey = barKey(mode),
                payload = MeeshyApi.json.encodeToString(statuses),
                cachedAt = SystemCacheClock.nowMillis(),
            ),
        )
    }

    /** Drop the persisted bar for [mode] so the next cold launch is cold (iOS `invalidate`). */
    suspend fun invalidate(mode: StatusFeedMode) {
        dao.deleteByKey(barKey(mode))
    }

    internal companion object {
        fun barKey(mode: StatusFeedMode): String = "statuses:${mode.name.lowercase()}"
    }
}
