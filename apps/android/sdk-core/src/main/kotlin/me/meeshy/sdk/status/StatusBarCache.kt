package me.meeshy.sdk.status

import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.classifyCache
import me.meeshy.sdk.model.StatusEntry
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-memory L1 snapshot cache for the mood-statuses bar — the Android analogue of the
 * memory tier of iOS `CacheCoordinator.statuses`. Snapshots are keyed per
 * [StatusFeedMode] so the FRIENDS and DISCOVER bars cache independently (iOS
 * `cacheKey = "statuses_\(mode)"`).
 *
 * Serves the last snapshot instantly on a warm re-entry (ARCHITECTURE.md §4:
 * cache-first, network-second) while the ViewModel revalidates in the background,
 * classifying freshness through the [classifyCache] SSOT against [CachePolicy.Statuses].
 * It holds no network dependency and no product decisions — a pure keyed store the
 * ViewModel reads before, and writes after, every fetch/mutation. A disk L2 tier for
 * cold-launch parity (surviving a process death) is a tracked follow-up
 * (feature-parity §G).
 */
@Singleton
class StatusBarCache @Inject constructor(
    private val clock: CacheClock,
) {
    private data class Snapshot(val statuses: List<StatusEntry>, val cachedAt: Long)

    private val snapshots = ConcurrentHashMap<StatusFeedMode, Snapshot>()

    /**
     * Classify the cached bar for [mode]: [CacheResult.Empty] when never saved,
     * otherwise the fresh/stale/syncing verdict for the snapshot's age.
     */
    fun load(mode: StatusFeedMode): CacheResult<List<StatusEntry>> {
        val snapshot = snapshots[mode] ?: return CacheResult.Empty
        return classifyCache(snapshot.statuses, clock.nowMillis() - snapshot.cachedAt, CachePolicy.Statuses)
    }

    /** Persist [statuses] as the bar for [mode], stamped at the clock's current time. */
    fun save(mode: StatusFeedMode, statuses: List<StatusEntry>) {
        snapshots[mode] = Snapshot(statuses, clock.nowMillis())
    }

    /** Drop the cached bar for [mode] so the next [load] is cold (iOS `invalidate`). */
    fun invalidate(mode: StatusFeedMode) {
        snapshots.remove(mode)
    }
}
