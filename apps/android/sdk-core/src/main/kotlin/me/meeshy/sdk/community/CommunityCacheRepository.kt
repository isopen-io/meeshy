package me.meeshy.sdk.community

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

    fun list(): Flow<CacheResult<List<ApiCommunity>>> =
        source(LIST_NAMESPACE, FIRST_PAGE, ListSerializer(ApiCommunity.serializer())) {
            repository.list(offset = 0, limit = PAGE_SIZE).orThrow()
        }.results(CachePolicy.Communities, clock)

    fun detail(communityId: String): Flow<CacheResult<ApiCommunity>> =
        source(DETAIL_NAMESPACE, communityId, ApiCommunity.serializer()) {
            repository.get(communityId).orThrow()
        }.results(CachePolicy.Communities, clock)

    fun members(communityId: String): Flow<CacheResult<List<ApiCommunityMember>>> =
        source(MEMBERS_NAMESPACE, communityId, ListSerializer(ApiCommunityMember.serializer())) {
            repository.getMembers(communityId, offset = 0, limit = PAGE_SIZE).orThrow()
        }.results(CachePolicy.Participants, clock)

    fun channels(communityId: String): Flow<CacheResult<List<ApiConversation>>> =
        source(CHANNELS_NAMESPACE, communityId, ListSerializer(ApiConversation.serializer())) {
            repository.getConversations(communityId).orThrow()
        }.results(CachePolicy.Communities, clock)

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
    }
}
