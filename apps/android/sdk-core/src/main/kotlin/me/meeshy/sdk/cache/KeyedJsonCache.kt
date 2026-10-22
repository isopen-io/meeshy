package me.meeshy.sdk.cache

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.core.database.entity.KeyedJsonCacheEntity

private val keyedJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }

/** A decoded document and the instant it was fetched. */
data class KeyedJsonDocument<T>(val value: T, val fetchedAt: Long)

/**
 * One JSON document per (namespace, key) on disk — for a resource read whole (`community:list`,
 * `participants:<convId>`). Two namespaces never overwrite each other and one can be purged alone.
 */
class KeyedJsonCache(
    private val dao: KeyedJsonCacheDao,
    private val clock: CacheClock = SystemCacheClock,
) {
    suspend fun <T> put(namespace: String, key: String, value: T, serializer: KSerializer<T>) {
        dao.upsert(KeyedJsonCacheEntity(namespace, key, keyedJson.encodeToString(serializer, value), clock.nowMillis()))
    }

    /** `null` when nothing is stored OR the payload no longer decodes (a model that evolved). */
    suspend fun <T> get(namespace: String, key: String, serializer: KSerializer<T>): KeyedJsonDocument<T>? =
        dao.find(namespace, key)?.let { decode(it, serializer) }

    fun <T> observe(namespace: String, key: String, serializer: KSerializer<T>): Flow<KeyedJsonDocument<T>?> =
        dao.observe(namespace, key).map { row -> row?.let { decode(it, serializer) } }

    /** The instant the key was last fetched, even when its payload is unreadable. */
    fun observeFetchedAt(namespace: String, key: String): Flow<Long?> =
        dao.observe(namespace, key).map { it?.fetchedAt }

    suspend fun clear(namespace: String, key: String) = dao.delete(namespace, key)

    suspend fun clearNamespace(namespace: String) = dao.deleteNamespace(namespace)

    private fun <T> decode(row: KeyedJsonCacheEntity, serializer: KSerializer<T>): KeyedJsonDocument<T>? = try {
        KeyedJsonDocument(keyedJson.decodeFromString(serializer, row.payload), row.fetchedAt)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }
}
