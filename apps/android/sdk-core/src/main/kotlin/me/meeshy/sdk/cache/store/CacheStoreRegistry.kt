package me.meeshy.sdk.cache.store

import java.util.concurrent.CopyOnWriteArrayList
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.KSerializer
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.database.dao.CacheEntryDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.session.PerAccountCache
import timber.log.Timber

/** Ce que l'inventaire sait faire de chaque store : le vider, lacher sa memoire. */
interface CacheStoreHandle {
    val namespace: String
    val criticality: CacheCriticality get() = CacheCriticality.NORMAL

    /** Drops every key of the store on disk and in memory. */
    suspend fun clearAll()

    /** Lache le L1 (pression memoire) : la prochaine lecture retourne au disque, sans jamais vider l'ecran. */
    fun dropMemory() = Unit
}

/**
 * L'inventaire UNIQUE des stores de cache : un store n'existe pour l'app que s'il y est inscrit, et [reset] / [invalidateAll]
 * (deconnexion, changement de compte), [dropMemory] (onTrimMemory) et [flushAll] (arriere-plan) le parcourent TOUS. Il
 * s'inscrit comme [PerAccountCache] : [me.meeshy.sdk.session.SessionTeardown.wipe] le vide donc en plus de `clearAllTables`.
 * Un store construit a la main hors de [roomStore] est invisible de tout cela (iOS #7146 : le carnet du compte precedent
 * survivait) ; `CacheStoreRegistryCompletenessTest` fait rougir ce cas.
 */
@Singleton
class CacheStoreRegistry @Inject constructor(
    @IoDispatcher dispatcher: CoroutineDispatcher,
) : PerAccountCache {

    private val handles = CopyOnWriteArrayList<CacheStoreHandle>()
    internal val flusher = DirtyFlusher(CoroutineScope(SupervisorJob() + dispatcher))

    fun register(handle: CacheStoreHandle) {
        handles.add(handle)
    }

    fun namespaces(): Set<String> = handles.map { it.namespace }.toSet()

    /** Le SEUL moyen de construire un store Room de production : il est inscrit et dote d'un L1 de 20 cles. */
    fun <V> roomStore(
        dao: CacheEntryDao,
        namespace: String,
        policy: CachePolicy,
        serializer: KSerializer<V>,
        itemId: (V) -> String,
        criticality: CacheCriticality = CacheCriticality.NORMAL,
        clock: CacheClock = SystemCacheClock,
    ): RoomCacheStore<V> = RoomCacheStore(
        dao, namespace, policy, serializer, itemId, clock,
        l1Capacity = MemoryL1.DEFAULT_CAPACITY, flusher = flusher, criticality = criticality,
    ).also(::register)

    suspend fun reset() {
        handles.sortedBy { it.criticality }.forEach { handle ->
            try {
                handle.clearAll()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.e(failure, "CacheStore %s : echec du vidage", handle.namespace)
            }
        }
    }

    suspend fun invalidateAll() = reset()

    override suspend fun clear() = reset()

    fun dropMemory() = handles.forEach { it.dropMemory() }

    suspend fun flushAll(deadlineMillis: Long): Int = flusher.flushAll(deadlineMillis)
}
