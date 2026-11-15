package me.meeshy.sdk.search

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.search.ListMessageHit
import me.meeshy.sdk.model.search.ListMessageSearch
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.network.NetworkMonitor
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La réponse du serveur : [served] vient de la recherche unifiée (texte déjà élu par le Prisme),
 * [messages] de l'ancienne recherche par conversation (Prisme résolu sur l'appareil), et
 * [failed] vaut vrai quand le serveur n'a rien pu répondre.
 */
public data class RemoteMessageSearch(
    val messages: List<ApiMessage> = emptyList(),
    val failed: Boolean = false,
    val served: List<ListMessageHit> = emptyList(),
)

/**
 * Les messages que la recherche de la liste des conversations peut montrer (#14619) : ceux du
 * cache Room (index FTS, hydratés depuis le cache pour porter expéditeur et traductions), puis
 * ceux du serveur. Building block : aucun débounce, aucun état ; le « quand » est au ViewModel.
 */
public interface ListMessageSearchSource {
    public suspend fun local(query: String): List<ApiMessage>

    /** `null` hors ligne : le serveur n'est pas interrogé et la recherche s'en tient à l'appareil. */
    public suspend fun remote(query: String, conversationIds: List<String>): RemoteMessageSearch?
}

/**
 * La recherche unifiée `GET /messages/search` d'abord ; un serveur antérieur à la route (`404`)
 * retombe sur l'ancienne recherche par conversation, chaque conversation désignée
 * ([ListMessageSearch.remoteTargets] en exclut les conversations chiffrées de bout en bout)
 * interrogée en parallèle, au plus [ListMessageSearch.PER_CONVERSATION] messages par branche.
 */
@Singleton
public class RoomListMessageSearchSource @Inject constructor(
    private val index: LocalSearchIndex,
    private val messageDao: MessageDao,
    private val messageApi: MessageApi,
    private val network: NetworkMonitor,
) : ListMessageSearchSource {

    override suspend fun local(query: String): List<ApiMessage> =
        messageDao.hydrate(index.searchMessages(query, ListMessageSearch.LIMIT))

    override suspend fun remote(query: String, conversationIds: List<String>): RemoteMessageSearch? {
        if (!network.isOnline.value) return null
        when (val unified = apiCall { messageApi.searchAll(query, limit = ListMessageSearch.LIMIT) }) {
            is NetworkResult.Success -> return RemoteMessageSearch(served = unified.data.mapNotNull(ListMessageSearch::hitOf))
            is NetworkResult.Failure -> if (unified.error.httpStatus != HTTP_NOT_FOUND) return RemoteMessageSearch(failed = true)
        }
        return perConversation(query, conversationIds)
    }

    private suspend fun perConversation(query: String, conversationIds: List<String>): RemoteMessageSearch {
        if (conversationIds.isEmpty()) return RemoteMessageSearch(emptyList(), failed = false)
        val legs = coroutineScope {
            conversationIds.map { id ->
                async { apiCall { messageApi.search(id, query, limit = ListMessageSearch.PER_CONVERSATION) } }
            }.awaitAll()
        }
        val messages = legs.flatMap { leg -> if (leg is NetworkResult.Success) leg.data else emptyList() }
        return RemoteMessageSearch(messages, failed = legs.all { it is NetworkResult.Failure })
    }

    private companion object {
        const val HTTP_NOT_FOUND = 404
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ListMessageSearchSourceModule {
    @Binds
    abstract fun bindListMessageSearchSource(source: RoomListMessageSearchSource): ListMessageSearchSource
}
