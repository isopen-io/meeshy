package me.meeshy.sdk.engagement

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonElement
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.KeyedJsonCacheSource
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.game.GameWriteParser
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressParser
import me.meeshy.sdk.model.game.engagement.MeeshMintResult
import me.meeshy.sdk.net.api.EngagementApi
import me.meeshy.sdk.net.api.MeeshMintRequest
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.AccountFence

/**
 * La source de la progression — port de `EngagementProgressService` iOS : lecture de `GET /me/engagement` et frappe
 * d'une Meesh. Les charges sont lues par les parseurs tolérants de `:core:model` ; une charge illisible n'est
 * jamais gardée (le cache ne reçoit que ce que l'écran saura relire), les refus HTTP (409 `PRICE_CHANGED`,
 * dette…) remontent à l'appelant tels quels.
 *
 * **Cache-first.** [progress] sert le disque d'abord (`Fresh`, `Stale`, `Syncing`), `Empty` seulement à froid, et
 * un échec réseau garde ce qui est peint — jamais de spinner sur un cache non vide. Le cache garde la charge
 * BRUTE du serveur : une évolution du modèle Kotlin relit les mêmes octets, et la copie hors ligne est la
 * réponse serveur clé pour clé. Il est vidé à la déconnexion ([PerAccountCache]).
 */
@Singleton
class EngagementProgressRepository(
    private val api: EngagementApi,
    private val cache: KeyedJsonCache,
    private val clock: CacheClock,
) : PerAccountCache {

    @Inject
    constructor(api: EngagementApi, dao: KeyedJsonCacheDao, fence: AccountFence) :
        this(api, KeyedJsonCache(dao, fence = fence), SystemCacheClock)

    /**
     * La progression du compte, cache d'abord. [onSyncError] reçoit l'échec d'une revalidation silencieuse :
     * l'écran en tire sa pastille « hors ligne » ou son avis d'échec, sans jamais vider ce qui est peint.
     */
    fun progress(onSyncError: (Throwable) -> Unit = {}): Flow<CacheResult<ApiEngagementProgress>> =
        source().results(CachePolicy.UserStats, clock, onSyncError)
            .map { result -> result.parsed() }
            .flowOn(Dispatchers.Default)

    /** Force le réseau (tirer pour rafraîchir) et pose la charge au cache ; lève sur un échec, le cache reste. */
    suspend fun refresh() = source().revalidate()

    /** La progression du compte authentifié, ou `null` si la charge est absente ou illisible. */
    suspend fun fetchProgress(): ApiEngagementProgress? =
        EngagementProgressParser.parse(api.progress().data)

    /**
     * Frappe une Meesh. [requestId] est généré une fois par INTENTION de frappe ; [maxPrice] (> 0) est le prix que
     * l'écran a montré — au-delà, la passerelle refuse sans rien débiter.
     */
    suspend fun mintMeesh(requestId: String, maxPrice: Int? = null): MeeshMintResult? =
        GameWriteParser.mint(api.mintMeesh(MeeshMintRequest(requestId, maxPrice?.takeIf { it > 0 })).data?.toString())

    override suspend fun clear() = cache.clearNamespace(NAMESPACE)

    private fun source() = KeyedJsonCacheSource(cache, NAMESPACE, KEY, JsonElement.serializer()) {
        val payload = api.progress().data ?: throw UnreadableProgressException()
        EngagementProgressParser.parse(payload) ?: throw UnreadableProgressException()
        payload
    }

    /** Une charge que le cache gardait avant une évolution du modèle et qui ne se relit plus vaut « froid ». */
    private fun CacheResult<JsonElement>.parsed(): CacheResult<ApiEngagementProgress> = when (this) {
        is CacheResult.Fresh -> read(value)?.let { CacheResult.Fresh(it, ageMillis) } ?: CacheResult.Empty
        is CacheResult.Stale -> read(value)?.let { CacheResult.Stale(it, ageMillis) } ?: CacheResult.Empty
        is CacheResult.Syncing -> CacheResult.Syncing(value?.let(::read))
        CacheResult.Empty -> CacheResult.Empty
    }

    private fun read(payload: JsonElement): ApiEngagementProgress? = EngagementProgressParser.parse(payload)

    /** La passerelle a répondu, mais la charge n'est pas une progression lisible : rien n'est gardé. */
    class UnreadableProgressException : RuntimeException("engagement payload unreadable")

    private companion object {
        const val NAMESPACE = "engagement"
        const val KEY = "me"
    }
}
