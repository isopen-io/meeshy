package me.meeshy.sdk.cache

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.core.database.entity.KeyedJsonCacheEntity
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite

private val keyedJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }

/** A decoded document and the instant it was fetched. */
data class KeyedJsonDocument<T>(val value: T, val fetchedAt: Long)

/**
 * One JSON document per (namespace, key) on disk — for a resource read whole (`community:list`,
 * `participants:<convId>`). Two namespaces never overwrite each other and one can be purged alone.
 *
 * #13560 — the account boundary: a writer takes [ticket] when its request LEAVES and hands it to [put]; the row then
 * lands only while that account is still the one signed in (a response of A arriving after A's purge writes nothing
 * into B's cache). [put] has no default ticket: a writer states which account it writes for, `null` (unfenced) being an
 * explicit choice of a test or a tool, never a forgotten argument.
 */
class KeyedJsonCache(
    private val dao: KeyedJsonCacheDao,
    private val clock: CacheClock = SystemCacheClock,
    private val fence: AccountFence? = null,
) {
    /** The account a request leaving NOW belongs to; `null` without a fence. */
    suspend fun ticket(): AccountTicket? = fence?.currentTicket()

    suspend fun <T> put(
        namespace: String,
        key: String,
        value: T,
        serializer: KSerializer<T>,
        ticket: AccountTicket?,
    ) {
        fence.commitOrWrite(ticket) {
            dao.upsert(KeyedJsonCacheEntity(namespace, key, keyedJson.encodeToString(serializer, value), clock.nowMillis()))
        }
    }

    /**
     * Rewrites a stored document WITHOUT touching its fetch instant: a local mutation must never
     * make the key look freshly synced. No-op when nothing readable is stored.
     */
    suspend fun <T> update(
        namespace: String,
        key: String,
        serializer: KSerializer<T>,
        ticket: AccountTicket? = null,
        transform: (T) -> T,
    ) {
        fence.commitOrWrite(ticket) {
            val row = dao.find(namespace, key) ?: return@commitOrWrite
            val current = decode(row, serializer) ?: return@commitOrWrite
            dao.upsert(row.copy(payload = keyedJson.encodeToString(serializer, transform(current.value))))
        }
    }

    /**
     * Rewrites every readable document of [namespace] for which [transform] returns a new value
     * (`null` = leave it); fetch instants are untouched. Returns how many documents changed.
     */
    suspend fun <T> updateAll(namespace: String, serializer: KSerializer<T>, transform: (T) -> T?): Int =
        dao.findAll(namespace).count { row ->
            val next = decode(row, serializer)?.value?.let(transform) ?: return@count false
            dao.upsert(row.copy(payload = keyedJson.encodeToString(serializer, next)))
            true
        }

    /** `null` when nothing is stored OR the payload no longer decodes (a model that evolved). */
    suspend fun <T> get(namespace: String, key: String, serializer: KSerializer<T>): KeyedJsonDocument<T>? =
        dao.find(namespace, key)?.let { decode(it, serializer) }

    fun <T> observe(namespace: String, key: String, serializer: KSerializer<T>): Flow<KeyedJsonDocument<T>?> =
        dao.observe(namespace, key).map { row -> row?.let { decode(it, serializer) } }

    /** The value (`null` when unreadable) and its fetch instant, read from ONE row emission. */
    fun <T> observeSnapshot(namespace: String, key: String, serializer: KSerializer<T>): Flow<Pair<T?, Long?>> =
        dao.observe(namespace, key).map { row -> row?.let { decode(it, serializer)?.value } to row?.fetchedAt }

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
