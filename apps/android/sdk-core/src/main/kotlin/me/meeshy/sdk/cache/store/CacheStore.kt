package me.meeshy.sdk.cache.store

import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.cache.MutableCacheStore
import me.meeshy.sdk.model.cache.PaginationCursor

/**
 * The generic, disk-backed list store (iOS `GRDBCacheStore`): one table for every list resource,
 * told apart by a namespace, so a new list costs a policy and a serializer, not an entity.
 *
 * The three iOS write entry points are explicit here because each leaves a different freshness
 * clock behind (see [me.meeshy.sdk.model.cache.FreshnessWriteMode]).
 */
interface CacheStore<V> : MutableCacheStore<String, V> {

    /** A network fetch landed: the key's clock advances to now. Same as [save]. */
    suspend fun saveFetched(items: List<V>, key: String)

    /** A local mutation: the clock stays where it was, the key is never made falsely fresh. */
    suspend fun savePreservingFreshness(items: List<V>, key: String)

    /** A pushed snapshot: painted at once, dated just past the fresh window so it revalidates. */
    suspend fun saveAsStale(items: List<V>, key: String)

    /**
     * The stored list, emitting again only when a row's content or rank actually changed — a
     * revalidation that brought nothing new emits nothing, so the list never recomposes for it.
     * `null` = never synced; an empty list = synced and truly empty.
     */
    fun observe(key: String): Flow<List<V>?>

    suspend fun cursor(key: String): PaginationCursor?

    suspend fun clear(key: String)

    /** Drops every key of this store's namespace. */
    suspend fun clearAll()
}
