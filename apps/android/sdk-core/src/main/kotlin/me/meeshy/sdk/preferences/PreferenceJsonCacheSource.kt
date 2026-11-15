package me.meeshy.sdk.preferences

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.net.NetworkResult

/** Thrown when a preference revalidation fails; carries the API error message. */
internal class PreferenceSyncException(message: String) : Exception(message)

/**
 * [SwrCacheSource] over one [PreferenceSnapshotStore] key: the snapshot is decoded with
 * [serializer] (a corrupt blob reads as cold, never as a crash), and [revalidate] pulls
 * [fetch] and persists it with a fresh sync stamp. A failed fetch throws, leaving the cache.
 */
internal class PreferenceJsonCacheSource<T : Any>(
    private val store: PreferenceSnapshotStore,
    private val key: String,
    private val serializer: KSerializer<T>,
    private val json: Json,
    private val clock: CacheClock,
    private val fetch: suspend () -> NetworkResult<T>,
) : SwrCacheSource<T> {

    override fun observe(): Flow<T?> =
        store.observe(key).map { raw ->
            raw?.let { runCatching { json.decodeFromString(serializer, it) }.getOrNull() }
        }

    override fun lastSyncedAt(): Flow<Long?> = store.lastSyncedAt(key)

    override suspend fun revalidate() {
        when (val result = fetch()) {
            is NetworkResult.Success ->
                store.save(key, json.encodeToString(serializer, result.data), clock.nowMillis())
            is NetworkResult.Failure -> throw PreferenceSyncException(result.error.message)
        }
    }
}
