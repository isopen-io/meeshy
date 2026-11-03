package me.meeshy.sdk.preferences

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.model.PreferenceCategory
import me.meeshy.sdk.model.PreferenceCategoryCodec
import me.meeshy.sdk.model.routeSegment
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.net.api.PreferencesCategoryApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.apiCallUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Lecture cache-first et écriture optimiste des blocs audio, message, vidéo, document et application
 * (`GET` / `PATCH me/preferences/{categorie}`). Le dernier instantané durable est servi tout de suite,
 * hors ligne compris, puis revalidé en silence ; une panne ne l'efface jamais. L'instantané est le
 * cliché du codec (extras compris), donc une clé d'un serveur plus récent survit au redémarrage et
 * repart avec le PATCH suivant.
 */
@Singleton
public class PreferencesCategoryRepository @Inject constructor(
    private val readApi: PreferencesCategoryApi,
    private val writeApi: PreferencesApi,
    private val store: PreferenceSnapshotStore,
    private val clock: CacheClock,
) {
    public fun <T : Any> stream(
        codec: PreferenceCategoryCodec<T>,
        policy: CachePolicy = CachePolicy.Default,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<T>> =
        cacheFirstFlow(policy, source(codec), clock = clock, onRevalidateError = onSyncError)

    /** Rafraîchissement explicite (tirer pour rafraîchir). Lève en cas d'échec ; le cache reste. */
    public suspend fun <T : Any> refresh(codec: PreferenceCategoryCodec<T>) {
        source(codec).revalidate()
    }

    /** Le dernier instantané durable, ou les défauts serveur d'une clé jamais synchronisée. */
    public suspend fun <T : Any> cached(codec: PreferenceCategoryCodec<T>): T =
        source(codec).observe().first() ?: codec.fromStorage(null)

    /**
     * Applique [block] au cache (retour visuel instantané), envoie le cliché complet, et rend le cache
     * à son état précédent quand la passerelle refuse.
     */
    public suspend fun <T : Any> update(codec: PreferenceCategoryCodec<T>, block: T): NetworkResult<Unit> {
        val key = key(codec)
        val before = store.observe(key).first()
        val stamp = store.lastSyncedAt(key).first() ?: clock.nowMillis()
        store.save(key, codec.storageValue(block), stamp)
        val result = apiCallUnit { writeApi.patchBlock(codec.category.routeName(), codec.snapshot(block)) }
        if (result is NetworkResult.Failure && before != null) store.save(key, before, stamp)
        return result
    }

    private fun <T : Any> source(codec: PreferenceCategoryCodec<T>): SwrCacheSource<T> = object : SwrCacheSource<T> {
        override fun observe(): Flow<T?> = store.observe(key(codec)).map { raw -> raw?.let(codec::fromStorage) }

        override fun lastSyncedAt(): Flow<Long?> = store.lastSyncedAt(key(codec))

        override suspend fun revalidate() {
            when (val result = apiCall { readApi.getBlock(codec.category.routeName()) }) {
                is NetworkResult.Success ->
                    store.save(key(codec), codec.storageValue(codec.decode(result.data)), clock.nowMillis())
                is NetworkResult.Failure -> throw PreferenceSyncException(result.error.message)
            }
        }
    }

    private fun <T : Any> key(codec: PreferenceCategoryCodec<T>) = "block:${codec.category.routeName()}"

    private fun PreferenceCategory.routeName(): String = routeSegment
}
