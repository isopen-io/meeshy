package me.meeshy.sdk.cache

/**
 * Freshness and keep-alive windows for a cached resource (ARCHITECTURE.md §4).
 *
 * [freshForMillis]  — data within this age is [CacheResult.Fresh]; no revalidation.
 * [keepForMillis]   — data between fresh and keep is [CacheResult.Stale]; served +
 *                     background revalidation. Beyond keep, revalidation is forced
 *                     as [CacheResult.Syncing].
 */
data class CachePolicy(
    val freshForMillis: Long,
    val keepForMillis: Long,
) {
    init {
        require(freshForMillis >= 0) { "freshForMillis must be >= 0" }
        require(keepForMillis >= freshForMillis) { "keepForMillis must be >= freshForMillis" }
    }

    companion object {
        val Default = CachePolicy(
            freshForMillis = 5 * 60_000L,
            keepForMillis = 24 * 60 * 60_000L,
        )

        val Conversations = CachePolicy(
            freshForMillis = 5 * 60_000L,
            keepForMillis = 24 * 60 * 60_000L,
        )

        val Messages = CachePolicy(
            freshForMillis = 2 * 60_000L,
            keepForMillis = 30 * 24 * 60 * 60_000L,
        )

        val Profiles = CachePolicy(
            freshForMillis = 5 * 60_000L,
            keepForMillis = 60 * 60_000L,
        )

        val Feed = CachePolicy(
            freshForMillis = 2 * 60_000L,
            keepForMillis = 6 * 60 * 60_000L,
        )

        // Stories live ~24h and their unviewed/expiry state shifts quickly, so the
        // tray is fresh only briefly and kept for the story lifetime.
        val Stories = CachePolicy(
            freshForMillis = 60_000L,
            keepForMillis = 24 * 60 * 60_000L,
        )

        val Notifications = CachePolicy(
            freshForMillis = 60_000L,
            keepForMillis = 24 * 60 * 60_000L,
        )
    }
}
