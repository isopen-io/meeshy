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
import me.meeshy.sdk.model.conversationcard.ConversationCardResolution
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import me.meeshy.sdk.model.ShareLinkArrivalsListState
import me.meeshy.sdk.model.ShareLinkArrivalsPage
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.net.api.LinkDetailApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.session.AccountFence

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
) : PerAccountCache {
    @Inject
    constructor(api: LinkDetailApi, dao: KeyedJsonCacheDao, fence: AccountFence) :
        this(api, KeyedJsonCache(dao, fence = fence), SystemCacheClock)

    /**
     * La carte d'une conversation désignée par un lien, cache d'abord (#13672). Un refus du serveur est
     * un VERDICT qui se cache ([ConversationCardResolution.definitiveVerdict]) ; une panne n'en est pas
     * un : elle lève, le cache reste servi et [onRevalidateError] le dit.
     */
    fun card(
        target: ConversationCardTarget,
        onRevalidateError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<ConversationCardResolution>> =
        KeyedJsonCacheSource(cache, CARD, cardKey(target), ConversationCardResolution.serializer()) { fetchCard(target) }
            .results(CachePolicy.LinksAndTokens, clock, onRevalidateError)

    /** Pose un verdict connu localement (la carte d'une jonction confirmée), sans la dater comme relue. */
    suspend fun storeCard(target: ConversationCardTarget, resolution: ConversationCardResolution) {
        cache.update(CARD, cardKey(target), ConversationCardResolution.serializer()) { resolution }
    }

    /** Oublie la carte de [target] : la prochaine lecture repart du serveur (une jonction faite ailleurs l'a périmée). */
    suspend fun forgetCard(target: ConversationCardTarget) {
        cache.clear(CARD, cardKey(target))
    }

    private suspend fun fetchCard(target: ConversationCardTarget): ConversationCardResolution {
        val result = when (target) {
            is ConversationCardTarget.ShareLink -> apiCall { api.card(target.identifier) }
            is ConversationCardTarget.Direct -> apiCall { api.directCard(target.conversationId) }
        }
        return when (result) {
            is NetworkResult.Success -> ConversationCardResolution.Card(result.data)
            is NetworkResult.Failure ->
                ConversationCardResolution.definitiveVerdict(result.error.httpStatus, target)
                    ?: throw LinkFetchException(result.error.message)
        }
    }

    private fun cardKey(target: ConversationCardTarget): String = when (target) {
        is ConversationCardTarget.ShareLink -> "share:${target.identifier}"
        is ConversationCardTarget.Direct -> "direct:${target.conversationId}"
    }

    fun messages(identifier: String): Flow<CacheResult<JsonElement>> =
        source(MESSAGES, identifier, JsonElement.serializer()) { apiCall { api.messages(identifier, limit = PAGE_SIZE) } }
            .results(CachePolicy.LinksAndTokens, clock)

    fun arrivals(linkId: String): Flow<CacheResult<ShareLinkArrivalsPage>> =
        source(ARRIVALS, linkId, ShareLinkArrivalsPage.serializer()) { apiCall { api.arrivals(linkId, ShareLinkArrivalsListState.PAGE_SIZE) } }
            .results(CachePolicy.LinksAndTokens, clock)

    /** [onRevalidateError] dit qu'un rafraîchissement a échoué : sur cache vide, la fiche passe de « chargement » à « indisponible ». */
    fun stats(linkId: String, onRevalidateError: (Throwable) -> Unit = {}): Flow<CacheResult<ShareLinkArrivalStats>> =
        source(STATS, linkId, ShareLinkArrivalStats.serializer()) { apiCall { api.linkStats(linkId) } }
            .results(CachePolicy.LinksAndTokens, clock, onRevalidateError)

    /** Une page de la liste complète des arrivées ; `cursor` est celui de la page précédente. Jamais mise en cache : la première page l'est par [arrivals]. */
    suspend fun arrivalsPage(linkId: String, cursor: String?, limit: Int): NetworkResult<ShareLinkArrivalsPage> =
        apiCall { api.arrivals(linkId, limit, cursor) }

    /** La frontière de compte : rien d'un compte ne survit chez le suivant. */
    override suspend fun clear() {
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
