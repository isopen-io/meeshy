package me.meeshy.sdk.packs

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlowOf
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.PackInstallationUpdatedEvent
import me.meeshy.sdk.model.packs.PackPurchaseRefusal
import me.meeshy.sdk.model.packs.PackPurchaseResponse
import me.meeshy.sdk.model.packs.PackShopResponse
import me.meeshy.sdk.model.packs.applying
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PackApi
import me.meeshy.sdk.net.api.purchase
import me.meeshy.sdk.net.api.shop
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.PerAccountCache

/** Le sort d'un achat : confirmé par le serveur, ou refusé (lu pour ce qu'il dit). */
sealed interface PackPurchaseOutcome {
    data class Done(val purchase: PackPurchaseResponse) : PackPurchaseOutcome
    data class Refused(val refusal: PackPurchaseRefusal) : PackPurchaseOutcome
}

/**
 * La vitrine des packs (`GET /packs/shop`) et l'achat en Meeshes (`POST /packs/<domaine>/<slug>/purchase`).
 *
 * **Cache d'abord, par compte.** La dernière vitrine lue pour CE compte se repeint aussitôt (disque), la relecture
 * réseau la remplace : jamais un spinner sur un cache non vide. La fenêtre « fraîche » est de quelques secondes — chaque
 * ouverture relit le solde au serveur, qui reste seul à le dire, mais la ligne que cette relecture écrit ne relance pas
 * une relecture (une fenêtre nulle relisait sans fin tant que l'écran était ouvert). Un échec réseau ne vide rien. Le
 * cache est vidé à la déconnexion et au changement de compte ([PerAccountCache]) ; une réponse qui arrive après ce
 * changement n'écrit rien (la garde de [KeyedJsonCache]).
 *
 * **Aucun débit local.** Un achat ne touche le cache qu'APRÈS la réponse du serveur, et y écrit ce que le serveur a servi
 * (le pack, le solde). Un refus ou une coupure ne changent rien : l'écran relit la vitrine. Une relecture partie AVANT
 * qu'un achat soit confirmé n'écrit rien : sa vitrine a été calculée sans lui, elle repeindrait le pack non acheté et
 * l'ancien solde.
 */
@Singleton
class PackShopRepository(
    private val api: PackApi,
    private val cache: KeyedJsonCache,
    private val clock: CacheClock,
    private val fence: AccountFence? = null,
) : PerAccountCache {

    @Inject
    constructor(api: PackApi, dao: KeyedJsonCacheDao, fence: AccountFence) :
        this(api, KeyedJsonCache(dao, fence = fence), SystemCacheClock, fence)

    private val _installations = MutableSharedFlow<PackInstallationUpdatedEvent>(extraBufferCapacity = 16)

    /** Les installations du compte COURANT (ici ou sur un autre appareil), déjà reportées dans la vitrine en cache. */
    val installations: SharedFlow<PackInstallationUpdatedEvent> = _installations.asSharedFlow()

    private val writes = Mutex()
    private var confirmedPurchases = 0L

    fun shop(onSyncError: (Throwable) -> Unit = {}): Flow<CacheResult<PackShopResponse>> = cacheFirstFlowOf(
        policy = POLICY,
        snapshots = cache.observeSnapshot(NAMESPACE, KEY, PackShopResponse.serializer()),
        revalidate = ::refresh,
        clock = clock,
        onRevalidateError = onSyncError,
    )

    suspend fun refresh() {
        val ticket = cache.ticket()
        val before = writes.withLock { confirmedPurchases }
        val served = fetchShop()
        writes.withLock {
            if (confirmedPurchases == before) cache.put(NAMESPACE, KEY, served, PackShopResponse.serializer(), ticket)
        }
    }

    /** [requestId] naît AU GESTE chez l'appelant : rejouer le même identifiant ne débite qu'une fois. */
    suspend fun purchase(domain: AppearancePackDomain, slug: String, requestId: String): PackPurchaseOutcome {
        val ticket = cache.ticket()
        return when (val result = apiCall { api.purchase(domain, slug, requestId) }) {
            is NetworkResult.Success -> {
                writes.withLock {
                    confirmedPurchases += 1
                    cache.update(NAMESPACE, KEY, PackShopResponse.serializer(), ticket) { it.applying(domain, result.data) }
                }
                PackPurchaseOutcome.Done(result.data)
            }
            is NetworkResult.Failure ->
                PackPurchaseOutcome.Refused(PackPurchaseRefusal.of(result.error.httpStatus, result.error.code))
        }
    }

    /**
     * `pack:installation-updated` reçu sous [ticket] (pris AU REÇU) : la charge suffit, la vitrine en cache la reprend
     * sans relire le réseau, puis les écrans la reçoivent. Un compte clos depuis ne reçoit rien et n'écrit rien.
     */
    suspend fun onInstallationUpdated(event: PackInstallationUpdatedEvent, ticket: AccountTicket?) {
        if (fence != null && ticket != null && !fence.isCurrent(ticket)) return
        cache.update(NAMESPACE, KEY, PackShopResponse.serializer(), ticket) { it.applying(event) }
        if (fence == null || ticket == null || fence.isCurrent(ticket)) _installations.emit(event)
    }

    suspend fun installationTicket(): AccountTicket? = cache.ticket()

    override suspend fun clear() = cache.clearNamespace(NAMESPACE)

    private suspend fun fetchShop(): PackShopResponse =
        when (val result = apiCall { api.shop(PackShopResponse.OFFERED) }) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> throw PackShopUnavailableException(result.error.httpStatus)
        }

    /** La passerelle n'a pas servi la vitrine : ce que le cache garde reste peint. */
    class PackShopUnavailableException(val httpStatus: Int?) : RuntimeException("pack shop unavailable ($httpStatus)")

    private companion object {
        const val NAMESPACE = "pack-shop"
        const val KEY = "offered"
        const val HOUR_MILLIS = 60 * 60_000L
        const val JUST_READ_MILLIS = 5_000L

        val POLICY = CachePolicy(freshForMillis = JUST_READ_MILLIS, keepForMillis = 6 * HOUR_MILLIS)
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class PackShopModule {
    @Binds
    @IntoSet
    abstract fun bindPackShopAccountCache(impl: PackShopRepository): PerAccountCache
}
