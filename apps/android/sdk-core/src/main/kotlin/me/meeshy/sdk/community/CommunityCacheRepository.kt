package me.meeshy.sdk.community

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.KeyedJsonCacheSource
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Lecture cache-first (stale-while-revalidate) des communautés : la liste (page 0), la fiche, les
 * membres (page 0) et les channels. Chaque flux sert le disque d'abord — `Fresh`, `Stale` ou `Syncing`
 * — et ne rend `Empty` qu'à froid ; un échec réseau garde le cache, l'écran reste utilisable hors ligne.
 */
@Singleton
class CommunityCacheRepository(
    private val repository: CommunityRepository,
    private val cache: KeyedJsonCache,
    private val clock: CacheClock,
) {
    @Inject
    constructor(repository: CommunityRepository, dao: KeyedJsonCacheDao) :
        this(repository, KeyedJsonCache(dao), SystemCacheClock)

    fun list(onError: (Throwable) -> Unit = {}): Flow<CacheResult<List<ApiCommunity>>> =
        listSource().results(CachePolicy.Communities, clock, onError)

    fun detail(communityId: String, onError: (Throwable) -> Unit = {}): Flow<CacheResult<ApiCommunity>> =
        detailSource(communityId).results(CachePolicy.Communities, clock, onError)

    fun members(communityId: String, onError: (Throwable) -> Unit = {}): Flow<CacheResult<List<ApiCommunityMember>>> =
        membersSource(communityId).results(CachePolicy.Participants, clock, onError)

    fun channels(communityId: String, onError: (Throwable) -> Unit = {}): Flow<CacheResult<List<ApiConversation>>> =
        channelsSource(communityId).results(CachePolicy.Communities, clock, onError)

    /**
     * Relit le réseau et réécrit le disque — le flux correspondant se ré-émet. Vrai si la relecture a
     * abouti ; un échec garde le cache tel quel (tirer pour rafraîchir, ou réconcilier après une mutation).
     */
    suspend fun refreshList(): Boolean = revalidating(listSource())

    suspend fun refreshDetail(communityId: String): Boolean = revalidating(detailSource(communityId))

    suspend fun refreshMembers(communityId: String): Boolean = revalidating(membersSource(communityId))

    suspend fun refreshChannels(communityId: String): Boolean = revalidating(channelsSource(communityId))

    /** Efface la fiche, les membres et les channels d'une communauté (retrait, sortie, suppression). */
    suspend fun forget(communityId: String) {
        cache.clear(DETAIL_NAMESPACE, communityId)
        cache.clear(MEMBERS_NAMESPACE, communityId)
        cache.clear(CHANNELS_NAMESPACE, communityId)
    }

    /** La frontière de compte : rien d'un compte ne survit chez le suivant. */
    suspend fun clearAll() {
        listOf(LIST_NAMESPACE, DETAIL_NAMESPACE, MEMBERS_NAMESPACE, CHANNELS_NAMESPACE).forEach { cache.clearNamespace(it) }
    }

    private fun listSource() =
        source(LIST_NAMESPACE, FIRST_PAGE, ListSerializer(ApiCommunity.serializer())) {
            repository.list(offset = 0, limit = PAGE_SIZE).orThrow()
        }

    private fun detailSource(communityId: String) =
        source(DETAIL_NAMESPACE, communityId, ApiCommunity.serializer()) {
            repository.get(communityId).orThrow()
        }

    private fun membersSource(communityId: String) =
        source(MEMBERS_NAMESPACE, communityId, ListSerializer(ApiCommunityMember.serializer())) {
            repository.getMembers(communityId, offset = 0, limit = MEMBERS_PAGE_SIZE).orThrow()
        }

    private fun channelsSource(communityId: String) =
        source(CHANNELS_NAMESPACE, communityId, ListSerializer(ApiConversation.serializer())) {
            repository.getConversations(communityId).orThrow()
        }

    private suspend fun revalidating(source: KeyedJsonCacheSource<*>): Boolean =
        try {
            source.revalidate()
            true
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            false
        }

    private fun <T> source(
        namespace: String,
        key: String,
        serializer: KSerializer<T>,
        fetch: suspend () -> T,
    ) = KeyedJsonCacheSource(cache, namespace, key, serializer, fetch)

    private fun <T> NetworkResult<T>.orThrow(): T = when (this) {
        is NetworkResult.Success -> data
        is NetworkResult.Failure -> throw CommunityFetchException(error.message)
    }

    private class CommunityFetchException(message: String) : RuntimeException(message)

    private companion object {
        const val LIST_NAMESPACE = "community:list"
        const val DETAIL_NAMESPACE = "community:detail"
        const val MEMBERS_NAMESPACE = "community:members"
        const val CHANNELS_NAMESPACE = "community:channels"
        const val FIRST_PAGE = "page0"
        const val PAGE_SIZE = 20
        const val MEMBERS_PAGE_SIZE = 30
    }
}
