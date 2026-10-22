package me.meeshy.sdk.sharelink

import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.MyShareLink

/** La liste « Mes liens » telle que la dernière lecture l'a rendue, et son âge. */
public data class CachedShareLinks(val links: List<MyShareLink>, val ageMillis: Long, val isFresh: Boolean)

/**
 * Le cache-first de la liste « Mes liens » (miroir de `CacheCoordinator.shareLinks`, iOS) :
 * la liste ET la fiche d'un lien se peignent d'abord d'ici, le réseau n'est appelé que si la
 * loi de rechargement l'exige. La liste survit à l'écran qui l'a lue (singleton) ; la fiche y
 * écrit sa valeur optimiste pour que revenir à la liste montre le lien tel qu'il vient d'être
 * modifié. Un échec réseau n'écrase jamais ce cache.
 */
@Singleton
public class ShareLinksCache(
    private val clock: CacheClock,
    private val policy: CachePolicy,
) {
    @Inject
    public constructor() : this(SystemCacheClock, CachePolicy.Default)

    private data class Entry(val links: List<MyShareLink>, val syncedAt: Long)

    private val entry = AtomicReference<Entry?>(null)

    public fun read(): CachedShareLinks? {
        val current = entry.get() ?: return null
        val age = clock.nowMillis() - current.syncedAt
        return CachedShareLinks(current.links, age, isFresh = age <= policy.freshForMillis)
    }

    public fun find(linkId: String): MyShareLink? = entry.get()?.links?.firstOrNull { it.linkId == linkId }

    public fun put(links: List<MyShareLink>) {
        entry.set(Entry(links, clock.nowMillis()))
    }

    /** Une création vient d'avoir lieu : le contenu reste affiché mais n'est plus frais. */
    public fun markStale() {
        entry.updateAndGet { it?.copy(syncedAt = Long.MIN_VALUE / 2) }
    }

    /** Réécrit la liste (écriture optimiste, retour arrière) SANS la rajeunir. */
    public fun setLinks(links: List<MyShareLink>) {
        entry.updateAndGet { current -> current?.copy(links = links) }
    }

    public fun replace(link: MyShareLink) {
        entry.updateAndGet { current ->
            current?.copy(links = current.links.map { if (it.linkId == link.linkId) link else it })
        }
    }

    public fun remove(linkId: String) {
        entry.updateAndGet { current -> current?.copy(links = current.links.filterNot { it.linkId == linkId }) }
    }
}
