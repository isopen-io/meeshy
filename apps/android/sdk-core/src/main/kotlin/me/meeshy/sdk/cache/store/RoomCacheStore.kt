package me.meeshy.sdk.cache.store

import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
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
    override val namespace: String,
    override val policy: CachePolicy,
    private val serializer: KSerializer<V>,
    private val itemId: (V) -> String,
    private val clock: CacheClock = SystemCacheClock,
    l1Capacity: Int? = null,
    private val flusher: DirtyFlusher? = null,
    override val criticality: CacheCriticality = CacheCriticality.NORMAL,
) : CacheStore<V> {

    private class L1Entry<V>(val items: List<V>, val lastFetchedAt: Long)

    private val l1: MemoryL1<L1Entry<V>>? = l1Capacity?.let { MemoryL1(it) }
    private val generation = AtomicLong()


    override suspend fun load(key: String): CacheResult<List<V>> {
        val entry = read(key) ?: return CacheResult.Empty
        return classifyCache(entry.items, ageOf(entry), policy)
    }

    override suspend fun loadIgnoringExpiry(key: String): CachedSnapshot<V>? =
        read(key)?.let { CachedSnapshot(it.items, ageOf(it)) }

    private fun ageOf(entry: L1Entry<V>): Long = (clock.nowMillis() - entry.lastFetchedAt).coerceAtLeast(0L)

    /**
     * L1 d'abord : une cle deja vue ne touche pas Room. Une lecture disque ne peuple le L1 que si aucune ecriture n'a
     * eu lieu entre-temps (generation inchangee), sinon elle y poserait un instantane perime.
     */
    private suspend fun read(key: String): L1Entry<V>? {
        l1?.get(key)?.let { return it }
        val before = generation.get()
        val meta = dao.meta(namespace, key) ?: return null
        val items = decode(dao.items(namespace, key)) ?: return null
        val entry = L1Entry(items, meta.lastFetchedAt)
        if (generation.get() == before) l1?.put(key, entry)
        return entry
    }

    private fun invalidate(key: String? = null) {
        generation.incrementAndGet()
        if (key == null) l1?.clear() else l1?.remove(key)
    }

    override fun dropMemory() {
        invalidate()
    }

    override suspend fun save(items: List<V>, key: String) = write(items, key, FreshnessWriteMode.Fetched)

    override suspend fun saveFetched(items: List<V>, key: String) = write(items, key, FreshnessWriteMode.Fetched)

    override suspend fun savePreservingFreshness(items: List<V>, key: String) =
        write(items, key, FreshnessWriteMode.PreserveFreshness)

    override suspend fun saveAsStale(items: List<V>, key: String) = write(items, key, FreshnessWriteMode.AsStale)

    /**
     * Les lignes et la ligne de métadonnées vivent dans la MÊME table : une seule observation,
     * relue d'un bloc après chaque écriture. Deux flux combinés présentaient un instant la
     * métadonnée neuve avec les lignes d'avant (une liste vide qui clignote).
     */
    override fun observe(key: String): Flow<List<V>?> =
        dao.observeItems(namespace, key)
            .map { rows -> if (dao.meta(namespace, key) == null) null else decode(rows) }
            .distinctUntilChanged()

    override suspend fun cursor(key: String): PaginationCursor? =
        PaginationCursor.fromJson(dao.meta(namespace, key)?.payload)

    override suspend fun clear(key: String) {
        invalidate(key)
        try {
            dao.deleteKey(namespace, key)
        } finally {
            invalidate(key)
        }
    }

    override suspend fun clearAll() {
        invalidate()
        try {
            dao.deleteNamespace(namespace)
            flusher?.let { f -> f.pendingIds().filter { it.startsWith("$namespace/") }.forEach { f.markClean(it) } }
        } finally {
            invalidate()
        }
    }

    /**
     * Une ecriture qui echoue reste inscrite au dirty-set avec de quoi la rejouer (debounce, ou arriere-plan) ; l'echec
     * remonte quand meme a l'appelant, qui ne doit jamais prendre une ecriture perdue pour une ecriture rangee.
     */
    private suspend fun write(items: List<V>, key: String, mode: FreshnessWriteMode) {
        val dirtyId = "$namespace/$key"
        invalidate(key)
        try {
            persist(items, key, mode)
            flusher?.markClean(dirtyId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            flusher?.markDirty(dirtyId, criticality) {
                invalidate(key)
                persist(items, key, mode)
                invalidate(key)
            }
            throw failure
        } finally {
            invalidate(key)
        }
    }

    private suspend fun persist(items: List<V>, key: String, mode: FreshnessWriteMode) {
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
