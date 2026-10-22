package me.meeshy.sdk.model.cache

/**
 * Which freshness clock a cache write leaves behind — the three iOS entry points of
 * `GRDBCacheStore` (`save`, `savePreservingFreshness`, `saveAsStale`) as one value.
 *
 * - [Fetched]           — a network fetch just landed: the clock advances to now.
 * - [PreserveFreshness] — a LOCAL mutation (a like, a reorder): the clock stays where it was, so
 *                         the key is never made falsely fresh and still revalidates on cold start.
 * - [AsStale]           — a snapshot not born of a fetch (an FCM-pushed list): dated just beyond the
 *                         fresh window so it paints at once AND revalidates.
 */
public enum class FreshnessWriteMode {
    Fetched,
    PreserveFreshness,
    AsStale,
    ;

    /**
     * The `lastFetchedAt` a write of this mode stores. [existingFetchedAt] is the clock already on
     * disk (`null` for a key never written). A key born of a local mutation was never loaded, so it
     * is dated like [AsStale] rather than [Fetched] — otherwise a one-item list would pass for fresh
     * and skip the network load (iOS `upsert`).
     */
    public fun fetchedAt(
        nowMillis: Long,
        existingFetchedAt: Long?,
        freshForMillis: Long,
        keepForMillis: Long,
    ): Long = when (this) {
        Fetched -> nowMillis
        PreserveFreshness -> existingFetchedAt ?: staleDated(nowMillis, freshForMillis, keepForMillis)
        AsStale -> staleDated(nowMillis, freshForMillis, keepForMillis)
    }

    private fun staleDated(nowMillis: Long, freshForMillis: Long, keepForMillis: Long): Long =
        // Without a stale window (fresh == keep) no Stale state exists: fall back to a plain save.
        if (keepForMillis <= freshForMillis) nowMillis else nowMillis - freshForMillis - 1
}
