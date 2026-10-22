package me.meeshy.sdk.cache.store

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import me.meeshy.core.database.dao.CacheEntryDao
import me.meeshy.core.database.entity.CacheEntryEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.CachedSnapshot
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.classifyCache
import me.meeshy.sdk.model.cache.CacheDiff
import me.meeshy.sdk.model.cache.CacheIncoming
import me.meeshy.sdk.model.cache.CacheStoredRow
import me.meeshy.sdk.model.cache.FreshnessWriteMode
import me.meeshy.sdk.model.cache.PaginationCursor

private val payloadJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }

/**
 * [CacheStore] on Room's `cache_entries` table. One row per item, a metadata row per key holding
 * the freshness clock and the persisted pagination cursor.
 *
 * A write is a diff ([CacheDiff]): rows that left are deleted, rows whose SHA-256 is unchanged
 * are skipped, only the rest is written. A row that no longer decodes makes the whole key a cache
 * miss (revalidate from the network) — never a crash.
 */
class RoomCacheStore<V>(
    private val dao: CacheEntryDao,
    private val namespace: String,
    override val policy: CachePolicy,
    private val serializer: KSerializer<V>,
    private val itemId: (V) -> String,
    private val clock: CacheClock = SystemCacheClock,
) : CacheStore<V> {

    override suspend fun load(key: String): CacheResult<List<V>> {
        val meta = dao.meta(namespace, key) ?: return CacheResult.Empty
        val items = decode(dao.items(namespace, key)) ?: return CacheResult.Empty
        val age = (clock.nowMillis() - meta.lastFetchedAt).coerceAtLeast(0L)
        return classifyCache(items, age, policy)
    }

    override suspend fun loadIgnoringExpiry(key: String): CachedSnapshot<V>? {
        val meta = dao.meta(namespace, key) ?: return null
        val items = decode(dao.items(namespace, key)) ?: return null
        return CachedSnapshot(items, (clock.nowMillis() - meta.lastFetchedAt).coerceAtLeast(0L))
    }

    override suspend fun save(items: List<V>, key: String) = write(items, key, FreshnessWriteMode.Fetched)

    override suspend fun saveFetched(items: List<V>, key: String) = write(items, key, FreshnessWriteMode.Fetched)

    override suspend fun savePreservingFreshness(items: List<V>, key: String) =
        write(items, key, FreshnessWriteMode.PreserveFreshness)

    override suspend fun saveAsStale(items: List<V>, key: String) = write(items, key, FreshnessWriteMode.AsStale)

    override fun observe(key: String): Flow<List<V>?> =
        combine(dao.observeItems(namespace, key), dao.observeMeta(namespace, key)) { rows, meta ->
            if (meta == null) null else decode(rows)
        }.distinctUntilChanged()

    override suspend fun cursor(key: String): PaginationCursor? =
        PaginationCursor.fromJson(dao.meta(namespace, key)?.payload)

    override suspend fun clear(key: String) = dao.deleteKey(namespace, key)

    override suspend fun clearAll() = dao.deleteNamespace(namespace)

    private suspend fun write(items: List<V>, key: String, mode: FreshnessWriteMode) {
        val stored = CacheDiff.bounded(items, itemId, policy.maxItemCount)
        val payloads = stored.map { payloadJson.encodeToString(serializer, it) }
        val hashes = payloads.map(CacheDiff::contentHash)
        val ids = stored.map(itemId)
        val existing = dao.index(namespace, key)
        val plan = CacheDiff.plan(
            existing = existing.map { CacheStoredRow(it.itemId, it.position, it.contentHash) },
            incoming = ids.zip(hashes) { id, hash -> CacheIncoming(id, hash) },
        )
        val existingMeta = dao.meta(namespace, key)
        val now = clock.nowMillis()
        val fetchedAt = mode.fetchedAt(now, existingMeta?.lastFetchedAt, policy.freshForMillis, policy.keepForMillis)
        val indexById = ids.withIndex().associate { it.value to it.index }
        val upserts = plan.upserts.map { up ->
            val index = indexById.getValue(up.itemId)
            CacheEntryEntity(namespace, key, up.itemId, up.position, up.contentHash, fetchedAt, payloads[index])
        }
        val metaChanged = existingMeta == null || existingMeta.lastFetchedAt != fetchedAt
        val meta = if (metaChanged) {
            CacheEntryEntity(
                namespace, key, CacheEntryEntity.META_ITEM_ID, CacheEntryEntity.META_POSITION,
                "", fetchedAt, existingMeta?.payload.orEmpty(),
            )
        } else {
            null
        }
        if (plan.isNoOp && meta == null) return
        dao.apply(namespace, key, plan.deletes, upserts, plan.moves.associate { it.itemId to it.position }, meta)
    }

    private fun decode(rows: List<CacheEntryEntity>): List<V>? = try {
        rows.map { payloadJson.decodeFromString(serializer, it.payload) }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }
}
