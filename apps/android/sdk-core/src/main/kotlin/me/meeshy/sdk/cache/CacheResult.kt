package me.meeshy.sdk.cache

/**
 * Stale-while-revalidate cache states (ARCHITECTURE.md §4).
 *
 * [Fresh]   — within staleTTL, served as-is.
 * [Stale]   — between staleTTL and TTL, served immediately + background refresh.
 * [Syncing] — expired or cold; stale data (if any) emitted while revalidation runs.
 * [Empty]   — never loaded; skeleton shown until [Syncing] completes.
 */
sealed interface CacheResult<out T> {

    data class Fresh<T>(val value: T, val ageMillis: Long) : CacheResult<T>

    data class Stale<T>(val value: T, val ageMillis: Long) : CacheResult<T>

    data class Syncing<T>(val value: T?) : CacheResult<T>

    data object Empty : CacheResult<Nothing>
}

val <T> CacheResult<T>.valueOrNull: T?
    get() = when (this) {
        is CacheResult.Fresh -> value
        is CacheResult.Stale -> value
        is CacheResult.Syncing -> value
        CacheResult.Empty -> null
    }
