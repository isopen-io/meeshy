package me.meeshy.sdk.sharelink

import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.core.common.IoDispatcher
import javax.inject.Inject
import javax.inject.Singleton
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.session.PerAccountCache

/** La liste « Mes liens » telle que la dernière lecture l'a rendue, et son âge. */
public data class CachedShareLinks(val links: List<MyShareLink>, val ageMillis: Long, val isFresh: Boolean)

/**
 * Le cache-first de la liste « Mes liens » (miroir de `CacheCoordinator.shareLinks`, iOS) :
 * la liste ET la fiche d'un lien se peignent d'abord d'ici, le réseau n'est appelé que si la
 * loi de rechargement l'exige. La liste survit à l'écran qui l'a lue (singleton) ; la fiche y
 * écrit sa valeur optimiste pour que revenir à la liste montre le lien tel qu'il vient d'être
 * modifié. Un échec réseau n'écrase jamais ce cache. Vidé à la déconnexion ([PerAccountCache]) :
 * un second compte n'ouvre jamais « Mes liens » sur les liens du premier.
 */
@Singleton
public class ShareLinksCache(
    private val clock: CacheClock,
    private val policy: CachePolicy,
    private val disk: ShareLinksDiskStore = NoShareLinksDiskStore,
    dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : PerAccountCache {
    public constructor() : this(SystemCacheClock, CachePolicy.Default)

    @Inject
    internal constructor(disk: ShareLinksDiskStore, @IoDispatcher dispatcher: CoroutineDispatcher) :
        this(SystemCacheClock, CachePolicy.Default, disk, dispatcher)

    private data class Entry(val links: List<MyShareLink>, val syncedAt: Long)

    private val entry = AtomicReference<Entry?>(null)
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val diskLock = Mutex()

    init {
        if (disk !== NoShareLinksDiskStore) scope.launch { hydrate() }
    }

    /**
     * Relit le disque dans la mémoire (démarrage à froid, hors ligne) : la liste se peint au premier cadre. Sans effet
     * si une lecture réseau a déjà posé une valeur, ou si la copie disque a passé la rétention.
     */
    internal suspend fun hydrate() {
        val saved = try {
            diskLock.withLock { disk.read() }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        } ?: return
        if (clock.nowMillis() - saved.syncedAt > policy.keepForMillis) return
        entry.compareAndSet(null, Entry(saved.links, saved.syncedAt))
    }

    /** Le disque suit la mémoire : la dernière valeur gagne, quel que soit l'ordre dans lequel les écritures s'exécutent. */
    private fun persist() {
        if (disk === NoShareLinksDiskStore) return
        scope.launch {
            diskLock.withLock {
                val current = entry.get() ?: return@withLock
                try {
                    disk.write(PersistedShareLinks(current.links, current.syncedAt))
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    // Le disque est un confort : l'écran continue de servir la mémoire.
                }
            }
        }
    }

    public fun read(): CachedShareLinks? {
        val current = entry.get() ?: return null
        val age = clock.nowMillis() - current.syncedAt
        return CachedShareLinks(current.links, age, isFresh = age <= policy.freshForMillis)
    }

    public fun find(linkId: String): MyShareLink? = entry.get()?.links?.firstOrNull { it.linkId == linkId }

    public fun put(links: List<MyShareLink>) {
        entry.set(Entry(links, clock.nowMillis()))
        persist()
    }

    /** Une création vient d'avoir lieu : le contenu reste affiché mais n'est plus frais. */
    public fun markStale() {
        entry.updateAndGet { it?.copy(syncedAt = Long.MIN_VALUE / 2) }
        persist()
    }

    /** Réécrit la liste (écriture optimiste, retour arrière) SANS la rajeunir. */
    public fun setLinks(links: List<MyShareLink>) {
        entry.updateAndGet { current -> current?.copy(links = links) }
        persist()
    }

    public fun replace(link: MyShareLink) {
        entry.updateAndGet { current ->
            current?.copy(links = current.links.map { if (it.linkId == link.linkId) link else it })
        }
        persist()
    }

    public fun remove(linkId: String) {
        entry.updateAndGet { current -> current?.copy(links = current.links.filterNot { it.linkId == linkId }) }
        persist()
    }

    override suspend fun clear() {
        entry.set(null)
        try {
            diskLock.withLock { disk.clear() }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // La barrière de compte purge de toute façon la table.
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ShareLinksCacheModule {
    @Binds
    @IntoSet
    abstract fun bindAccountCache(cache: ShareLinksCache): PerAccountCache
}
