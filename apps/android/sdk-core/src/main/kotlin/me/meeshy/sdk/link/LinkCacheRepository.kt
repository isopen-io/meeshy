package me.meeshy.sdk.link

import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonElement
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.KeyedJsonCacheSource
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.ShareLinkArrivalStats
import me.meeshy.sdk.model.ShareLinkArrivalsPage
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.LinkDetailApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Lecture cache-first d'un lien de partage : sa carte, ses messages, ses arrivées (première page) et
 * ses statistiques. Le disque est servi d'abord (`Fresh`, `Stale`, `Syncing`) ; `Empty` seulement à
 * froid, et un échec réseau garde le cache — jamais de spinner sur un cache non vide.
 */
@Singleton
class LinkCacheRepository(
    private val api: LinkDetailApi,
    private val cache: KeyedJsonCache,
    private val clock: CacheClock,
) {
    @Inject
    constructor(api: LinkDetailApi, dao: KeyedJsonCacheDao) : this(api, KeyedJsonCache(dao), SystemCacheClock)

    fun card(identifier: String): Flow<CacheResult<JsonElement>> =
        source(CARD, identifier, JsonElement.serializer()) { apiCall { api.card(identifier) } }
            .results(CachePolicy.LinksAndTokens, clock)

    fun messages(identifier: String): Flow<CacheResult<JsonElement>> =
        source(MESSAGES, identifier, JsonElement.serializer()) { apiCall { api.messages(identifier, limit = PAGE_SIZE) } }
            .results(CachePolicy.LinksAndTokens, clock)

    fun arrivals(linkId: String): Flow<CacheResult<ShareLinkArrivalsPage>> =
        source(ARRIVALS, linkId, ShareLinkArrivalsPage.serializer()) { apiCall { api.arrivals(linkId, PAGE_SIZE) } }
            .results(CachePolicy.LinksAndTokens, clock)

    fun stats(linkId: String): Flow<CacheResult<ShareLinkArrivalStats>> =
        source(STATS, linkId, ShareLinkArrivalStats.serializer()) { apiCall { api.linkStats(linkId) } }
            .results(CachePolicy.LinksAndTokens, clock)

    /** La frontière de compte : rien d'un compte ne survit chez le suivant. */
    suspend fun clearAll() {
        listOf(CARD, MESSAGES, ARRIVALS, STATS).forEach { cache.clearNamespace(it) }
    }

    private fun <T> source(
        namespace: String,
        key: String,
        serializer: KSerializer<T>,
        fetch: suspend () -> NetworkResult<T>,
    ) = KeyedJsonCacheSource(cache, namespace, key, serializer) {
        when (val result = fetch()) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> throw LinkFetchException(result.error.message)
        }
    }

    private class LinkFetchException(message: String) : RuntimeException(message)

    private companion object {
        const val CARD = "link:card"
        const val MESSAGES = "link:messages"
        const val ARRIVALS = "link:arrivals"
        const val STATS = "link:stats"
        const val PAGE_SIZE = 20
    }
}
