package me.meeshy.sdk.pack

import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.pack.PackDomain
import me.meeshy.sdk.model.packs.PackPurchaseRefusal
import me.meeshy.sdk.model.packs.PackShopFailure
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.packs.PackPurchaseOutcome
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **Les étagères des packs d'apparence** (fonds, contours, bannières, cadres de bannière, cadres de gloire), une
 * [PackStore] par domaine : installer, retirer et acheter sans rien perdre.
 *
 * - L'installation est IDEMPOTENTE : demander l'état où le pack est déjà ne part pas sur le réseau et ne double rien.
 * - L'achat est idempotent par `requestId` (né au geste, réutilisé au nouvel essai) ; un refus arrive structuré
 *   ([PackPurchaseRefusal]) et ne change ni possession ni étagère. L'achat n'est offert qu'aux domaines payants.
 * - Hors ligne, l'installation est refusée proprement ([PackToggleOutcome.Offline]) et la dernière étagère connue reste
 *   servie sans spinner.
 */
@Singleton
class CosmeticPackRepository(
    private val transport: PackTransport,
    private val cache: KeyedJsonCache,
    private val isOnline: () -> Boolean,
) : PerAccountCache {
    @Inject
    constructor(transport: PackTransport, dao: KeyedJsonCacheDao, fence: AccountFence, network: NetworkMonitor) :
        this(transport, KeyedJsonCache(dao, SystemCacheClock, fence), { network.isOnline.value })

    private val stores = HashMap<PackDomain, PackStore<ShopPack>>()

    @Synchronized
    fun store(domain: PackDomain): PackStore<ShopPack> = stores.getOrPut(domain) {
        PackStore(PackService(domain, ShopPack.serializer(), transport), cache, ShopPack.serializer(), isOnline = isOnline)
    }

    private fun service(domain: PackDomain) = PackService(domain, ShopPack.serializer(), transport)

    /** Installe ([wanted] vrai) ou retire : rien à faire si le pack est déjà dans l'état voulu. */
    suspend fun setInstalled(domain: PackDomain, slug: String, wanted: Boolean): PackToggleOutcome {
        val store = store(domain)
        val known = store.state.value.let { it.catalogue?.firstOrNull { p -> p.slug == slug } ?: it.installed?.firstOrNull { p -> p.slug == slug } }
            ?: return PackToggleOutcome.Ignored
        if (known.installed == wanted) return PackToggleOutcome.Done
        return store.toggle(known)
    }

    suspend fun purchase(domain: PackDomain, slug: String, requestId: String): PackPurchaseOutcome =
        try {
            val purchase = service(domain).purchase(slug, requestId)
            store(domain).absorb(purchase.pack)
            PackPurchaseOutcome.Done(purchase)
        } catch (e: PackServiceException) {
            PackPurchaseOutcome.Refused(
                when (e.kind) {
                    PackServiceException.Kind.REJECTED -> PackPurchaseRefusal.of(e.httpStatus, e.code)
                    PackServiceException.Kind.NOT_PURCHASABLE, PackServiceException.Kind.UNROUTABLE_DOMAIN ->
                        PackPurchaseRefusal(PackShopFailure.GENERIC, definitive = true)
                    PackServiceException.Kind.OFFLINE, PackServiceException.Kind.UNREADABLE -> PackPurchaseRefusal.UNREAD
                },
            )
        }

    override suspend fun clear() {
        val all = synchronized(this) { stores.values.toList() }
        all.forEach { it.clear() }
    }
}
