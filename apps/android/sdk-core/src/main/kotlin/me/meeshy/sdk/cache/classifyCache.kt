package me.meeshy.sdk.cache

/**
 * Pure stale-while-revalidate classification (ARCHITECTURE.md §4): map a cached
 * [value] and its [ageMillis] against [policy] into the [CacheResult] the whole app
 * reasons over. The single source of truth for the fresh/stale/expired/empty decision —
 * both the streaming [cacheFirstFlow] and the snapshot
 * [me.meeshy.sdk.status.StatusBarCache] classify through here so their boundary rules
 * can never drift apart.
 *
 * - `null` value → [CacheResult.Empty] (cold, never loaded).
 * - age ≤ [CachePolicy.freshForMillis] → [CacheResult.Fresh].
 * - age ≤ [CachePolicy.keepForMillis] → [CacheResult.Stale] (serve + revalidate).
 * - otherwise → [CacheResult.Syncing] carrying the expired-but-usable value.
 */
fun <T> classifyCache(value: T?, ageMillis: Long, policy: CachePolicy): CacheResult<T> =
    when {
        value == null -> CacheResult.Empty
        ageMillis <= policy.freshForMillis -> CacheResult.Fresh(value, ageMillis)
        ageMillis <= policy.keepForMillis -> CacheResult.Stale(value, ageMillis)
        else -> CacheResult.Syncing(value)
    }
