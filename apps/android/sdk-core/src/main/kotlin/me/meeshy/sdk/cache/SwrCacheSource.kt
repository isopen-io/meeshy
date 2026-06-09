package me.meeshy.sdk.cache

import kotlinx.coroutines.flow.Flow

/**
 * Contract for a stale-while-revalidate data source (ARCHITECTURE.md §4).
 *
 * [observe]      — emits the current cached value (null = cold/empty cache).
 * [lastSyncedAt] — emits the epoch-millis of the last successful revalidation.
 * [revalidate]   — fetches from the network and persists the result; throws on failure.
 */
interface SwrCacheSource<T> {
    fun observe(): Flow<T?>
    fun lastSyncedAt(): Flow<Long?>
    suspend fun revalidate()
}
