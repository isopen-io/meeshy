package me.meeshy.sdk.cache

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.KSerializer

/**
 * Stale-while-revalidate source of ONE keyed document, for [cacheFirstFlow]. [fetch] throws on a
 * network failure: the flow swallows it and keeps serving the last cached value (never emptied).
 * An unreadable payload reads as absent ([CacheResult.Empty]) and triggers a revalidation.
 */
class KeyedJsonCacheSource<T>(
    private val cache: KeyedJsonCache,
    private val namespace: String,
    private val key: String,
    private val serializer: KSerializer<T>,
    private val fetch: suspend () -> T,
) : SwrCacheSource<T> {

    override fun observe(): Flow<T?> = cache.observe(namespace, key, serializer).map { it?.value }

    override fun lastSyncedAt(): Flow<Long?> = cache.observeFetchedAt(namespace, key)

    override suspend fun revalidate() {
        cache.put(namespace, key, fetch(), serializer)
    }

    fun results(
        policy: CachePolicy,
        clock: CacheClock = SystemCacheClock,
        onRevalidateError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<T>> = cacheFirstFlow(policy, this, clock, onRevalidateError)
}
