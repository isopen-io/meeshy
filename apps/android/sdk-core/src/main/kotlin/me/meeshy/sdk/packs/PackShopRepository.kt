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
import me.meeshy.sdk.model.game.GameUpdatedEvent
import me.meeshy.sdk.model.game.shouldApplyGameState
import me.meeshy.sdk.model.packs.PackInstallationUpdatedEvent
import me.meeshy.sdk.model.packs.PackPurchaseRefusal
import me.meeshy.sdk.model.packs.PackPurchaseResponse
import me.meeshy.sdk.model.packs.PackShopResponse
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.sdk.model.packs.applying
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PackApi
import me.meeshy.sdk.net.api.catalogue
import me.meeshy.sdk.net.api.purchase
import me.meeshy.sdk.net.api.setInstalled
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

/** Le sort d'une installation ou d'un retrait : confirmé par le serveur (son résumé du pack), ou refusé. */
sealed interface PackInstallOutcome {
    data class Done(val pack: ShopPack) : PackInstallOutcome
    data class Refused(val refusal: PackPurchaseRefusal) : PackInstallOutcome
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
    private var localWrites = 0L
    private var appliedGameRevision: Long? = null

    fun shop(onSyncError: (Throwable) -> Unit = {}): Flow<CacheResult<PackShopResponse>> = cacheFirstFlowOf(
        policy = POLICY,
        snapshots = cache.observeSnapshot(NAMESPACE, KEY, PackShopResponse.serializer()),
        revalidate = ::refresh,
        clock = clock,
        onRevalidateError = onSyncError,
    )

    suspend fun refresh() {
        val ticket = cache.ticket()
        val before = writes.withLock { localWrites }
        val served = fetchShop()
        writes.withLock {
            if (localWrites == before) cache.put(NAMESPACE, KEY, served, PackShopResponse.serializer(), ticket)
        }
    }

    /** [requestId] naît AU GESTE chez l'appelant : rejouer le même identifiant ne débite qu'une fois. */
    suspend fun purchase(domain: AppearancePackDomain, slug: String, requestId: String): PackPurchaseOutcome {
        val ticket = cache.ticket()
        return when (val result = apiCall { api.purchase(domain, slug, requestId) }) {
            is NetworkResult.Success -> {
                writes.withLock {
                    localWrites += 1
                    cache.update(NAMESPACE, KEY, PackShopResponse.serializer(), ticket) { it.applying(domain, result.data) }
                }
                PackPurchaseOutcome.Done(result.data)
            }
            is NetworkResult.Failure ->
                PackPurchaseOutcome.Refused(PackPurchaseRefusal.of(result.error.httpStatus, result.error.code))
        }
    }

    /**
     * Installer ([installed] vrai) ou retirer un pack À MOI. Le serveur est seul juge de la possession : un pack qui n'est
     * pas à moi répond `403 PACK_NOT_OWNED`, lu comme un refus définitif. Le cache ne reçoit que SA réponse (l'état servi,
     * jamais le geste), puis le profil et la liste des packs installés l'apprennent par [installations] — le même chemin
     * qu'un événement d'un autre appareil. Un compte clos entre-temps n'écrit ni n'annonce rien.
     */
    suspend fun setInstalled(domain: AppearancePackDomain, slug: String, installed: Boolean): PackInstallOutcome {
        val ticket = cache.ticket()
        return when (val result = apiCall { api.setInstalled(domain, slug, installed) }) {
            is NetworkResult.Success -> {
                val confirmed = result.data
                writes.withLock {
                    localWrites += 1
                    cache.update(NAMESPACE, KEY, PackShopResponse.serializer(), ticket) { it.installSettled(domain, confirmed) }
                }
                if (fence == null || ticket == null || fence.isCurrent(ticket)) {
                    _installations.emit(
                        PackInstallationUpdatedEvent(domain.wire, slug, installed = confirmed.installed, owned = confirmed.owned),
                    )
                }
                PackInstallOutcome.Done(confirmed)
            }
            is NetworkResult.Failure ->
                PackInstallOutcome.Refused(PackPurchaseRefusal.of(result.error.httpStatus, result.error.code))
        }
    }

    /**
     * `pack:installation-updated` reçu sous [ticket] (pris AU REÇU) : la charge suffit, la vitrine en cache la reprend
     * sans relire le réseau, puis les écrans la reçoivent. Un compte clos depuis ne reçoit rien et n'écrit rien. Une
     * lecture de la vitrine partie AVANT l'événement ne l'efface pas en revenant, comme pour un achat confirmé.
     */
    suspend fun onInstallationUpdated(event: PackInstallationUpdatedEvent, ticket: AccountTicket?) {
        if (fence != null && ticket != null && !fence.isCurrent(ticket)) return
        writes.withLock {
            localWrites += 1
            cache.update(NAMESPACE, KEY, PackShopResponse.serializer(), ticket) { it.applying(event) }
        }
        if (fence == null || ticket == null || fence.isCurrent(ticket)) _installations.emit(event)
    }

    /**
     * `game:updated` reçu sous [ticket] (pris AU REÇU) : le solde de Meeshes servi par le trésor de l'événement remplace
     * celui de la vitrine en cache, sans débit ni calcul local. Un état STRICTEMENT plus ancien que le dernier appliqué
     * est ignoré (deux écritures qui se croisent) ; un événement sans bloc lisible relit la vitrine. Un compte clos
     * depuis ne reçoit rien.
     */
    suspend fun onGameUpdated(event: GameUpdatedEvent, ticket: AccountTicket?) {
        if (fence != null && ticket != null && !fence.isCurrent(ticket)) return
        val balance = event.balance
        val applied = writes.withLock {
            if (!shouldApplyGameState(event.gameRevision, appliedGameRevision)) return
            event.gameRevision?.let { appliedGameRevision = maxOf(it, appliedGameRevision ?: it) }
            if (balance != null) {
                localWrites += 1
                cache.update(NAMESPACE, KEY, PackShopResponse.serializer(), ticket) { it.withBalance(balance) }
            }
            balance != null
        }
        if (!applied && cache.get(NAMESPACE, KEY, PackShopResponse.serializer()) != null) refresh()
    }

    suspend fun installationTicket(): AccountTicket? = cache.ticket()

    override suspend fun clear() {
        writes.withLock { appliedGameRevision = null }
        cache.clearNamespace(NAMESPACE)
    }

    /**
     * La vitrine unique ; un ancien serveur qui la répond 404 est relu domaine par domaine (iOS `PackShopService`). Toute
     * autre panne remonte telle quelle : le cache garde ce qu'il a, jamais une vitrine vide fabriquée.
     */
    private suspend fun fetchShop(): PackShopResponse =
        when (val result = apiCall { api.shop(PackShopResponse.OFFERED) }) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure ->
                if (result.error.httpStatus == NOT_FOUND) composedFromDomains()
                else throw PackShopUnavailableException(result.error.httpStatus)
        }

    /** Un domaine que ce serveur ne sert pas est vide, jamais une erreur ; toute autre panne annule la recomposition. */
    private suspend fun composedFromDomains(): PackShopResponse = PackShopResponse.composed(
        PackShopResponse.OFFERED.map { domain ->
            domain to when (val result = apiCall { api.catalogue(domain) }) {
                is NetworkResult.Success -> result.data.packs
                is NetworkResult.Failure ->
                    if (result.error.httpStatus == NOT_FOUND) emptyList()
                    else throw PackShopUnavailableException(result.error.httpStatus)
            }
        },
    )

    /** La passerelle n'a pas servi la vitrine : ce que le cache garde reste peint. */
    class PackShopUnavailableException(val httpStatus: Int?) : RuntimeException("pack shop unavailable ($httpStatus)")

    private companion object {
        const val NOT_FOUND = 404
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
