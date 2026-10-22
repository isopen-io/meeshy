package me.meeshy.sdk.cache

/**
 * The last known items of an entry, read WITHOUT regard to its expiry, and how old they are.
 * See [MutableCacheStore.loadIgnoringExpiry].
 */
data class CachedSnapshot<V>(
    val items: List<V>,
    val ageMillis: Long,
)

/** A keyed store of item lists whose entries carry a [CachePolicy] (iOS `ReadableCacheStore`). */
interface ReadableCacheStore<K : Any, V> {
    val policy: CachePolicy

    /** The entry for [key] classified against [policy]; never throws on a missing entry. */
    suspend fun load(key: K): CacheResult<List<V>>
}

/** The writable half of a cache store (iOS `MutableCacheStore`). */
interface MutableCacheStore<K : Any, V> : ReadableCacheStore<K, V> {

    /**
     * Persists a fresh snapshot of [items] for [key]. Throws on a write failure so a caller
     * never mistakes a dropped write for a stored one; [CacheFirstLoader] catches it and
     * keeps the screen where it is.
     */
    suspend fun save(items: List<V>, key: K)

    /**
     * The last known items for [key] even past their keep window, so an expired entry can still
     * be painted instead of an empty screen when the network is down (iOS cache-04). `null` by
     * default: a store that purges on expiry has nothing to recover.
     */
    suspend fun loadIgnoringExpiry(key: K): CachedSnapshot<V>? = null
}
