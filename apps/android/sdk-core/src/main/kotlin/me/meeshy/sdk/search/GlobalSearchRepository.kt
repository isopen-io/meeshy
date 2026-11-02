package me.meeshy.sdk.search

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.model.search.SearchPane
import me.meeshy.sdk.model.search.SearchPaneFailure
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.UserApi
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Un message trouve, accompagne du titre de sa conversation pour l'affichage, et de la conversation
 * elle-meme quand on la connait (cache local ou volet reseau) : c'est elle qui donne sa photo a la
 * ligne (#12569), meme quand la conversation ne figure pas parmi les conversations trouvees.
 */
public data class MessageSearchHit(
    val message: ApiMessage,
    val conversationTitle: String,
    val conversation: ApiConversation? = null,
)

/** Le resultat des trois volets de la recherche globale, chacun degradable a vide. */
public data class GlobalSearchResults(
    val conversations: List<ApiConversation> = emptyList(),
    val users: List<UserSearchResult> = emptyList(),
    val messages: List<MessageSearchHit> = emptyList(),
)

/**
 * Fusionne les lots de messages venus de N conversations : aplati, dedoublonne par
 * id (premiere occurrence gardee), trie du plus recent au plus ancien. Les
 * timestamps ISO-8601 se comparent lexicographiquement ; un timestamp absent coule
 * en fin de liste plutot que d'exclure le resultat.
 */
public fun mergeMessageHits(batches: List<List<MessageSearchHit>>): List<MessageSearchHit> =
    batches
        .flatten()
        .distinctBy { it.message.id }
        .sortedByDescending { it.message.createdAt ?: "" }

/**
 * Recherche globale LOCAL D'ABORD — parite iOS `GlobalSearchViewModel.performSearch`.
 *
 * Le gateway n'a PAS d'endpoint unifie : trois volets tournent en parallele
 * (conversations, utilisateurs, messages). Chacun repond d'abord depuis l'appareil
 * ([LocalSearchSource] : index FTS, caches), puis le reseau se fond dans la liste
 * ([SearchResultMerger]). Le flux emet donc un instantane LOCAL (sans attendre le serveur,
 * hors ligne il est le seul) puis l'instantane fusionne. Un volet dont le reseau echoue rend
 * `failure` : jamais un faux « aucun resultat ». Les messages cherchent par eventail dans les
 * [maxMessageConversations] premieres conversations utiles, en COMPLEMENT de l'index local.
 *
 * Building block SDK : aucun etat, aucun debounce — le « quand chercher » est au ViewModel.
 */
@Singleton
public class GlobalSearchRepository @Inject constructor(
    private val conversationApi: ConversationApi,
    private val userApi: UserApi,
    private val messageApi: MessageApi,
    private val local: LocalSearchSource,
    private val network: NetworkMonitor,
) {
    public fun search(
        query: String,
        maxMessageConversations: Int = 10,
        messagesPerConversation: Int = 5,
        userLimit: Int = 20,
    ): Flow<GlobalSearchSnapshot> = flow {
        val offline = !network.isOnline.value
        coroutineScope {
            val remoteConversations = if (offline) null else async {
                apiCall { conversationApi.search(query) }
            }
            val remoteUsers = if (offline) null else async {
                apiCall { userApi.search(query, limit = userLimit, offset = 0) }
            }
            val localConversations = async { local.conversations(query) }
            val localUsers = async { local.users(query) }
            val localMessages = async { local.messages(query) }

            val firstPaint = GlobalSearchSnapshot(
                conversations = SearchPane(localConversations.await()),
                users = SearchPane(localUsers.await()),
                messages = SearchPane(localMessages.await()),
                remoteSettled = offline,
                offline = offline,
            )
            emit(firstPaint)
            if (offline) return@coroutineScope

            val conversationsResult = remoteConversations!!.await()
            val usersResult = remoteUsers!!.await()
            val conversations = SearchResultMerger.conversations(
                local = firstPaint.conversations.items,
                remote = conversationsResult.orEmpty(),
            )
            val titles = conversations.associate { it.id to titleOf(it) }
            val remoteMessages = fanOut(
                conversations.take(maxMessageConversations),
                query,
                messagesPerConversation,
                titles,
                conversationListFailed = conversationsResult is NetworkResult.Failure,
            )
            emit(
                GlobalSearchSnapshot(
                    conversations = SearchPane(conversations, conversationsResult.failureOrNull()),
                    users = SearchPane(
                        SearchResultMerger.users(firstPaint.users.items, usersResult.orEmpty()),
                        usersResult.failureOrNull(),
                    ),
                    messages = SearchPane(
                        SearchResultMerger.messages(firstPaint.messages.items, remoteMessages.items),
                        remoteMessages.failure.takeIf { firstPaint.messages.items.isEmpty() && remoteMessages.items.isEmpty() },
                    ),
                    remoteSettled = true,
                    offline = false,
                ),
            )
        }
    }

    private suspend fun fanOut(
        conversations: List<ApiConversation>,
        query: String,
        perConversation: Int,
        titles: Map<String, String>,
        conversationListFailed: Boolean,
    ): SearchPane<MessageSearchHit> = coroutineScope {
        val legs = conversations.map { conversation ->
            async { conversation to apiCall { messageApi.search(conversation.id, query, limit = perConversation) } }
        }.map { it.await() }
        val hits = legs.flatMap { (conversation, result) ->
            result.orEmpty().map { MessageSearchHit(it, titles[conversation.id].orEmpty(), conversation) }
        }
        val everyLegFailed = legs.isNotEmpty() && legs.all { it.second is NetworkResult.Failure }
        val nothingToAsk = legs.isEmpty() && conversationListFailed
        SearchPane(
            items = hits,
            failure = SearchPaneFailure.Unreachable.takeIf { everyLegFailed || nothingToAsk },
        )
    }

    private fun titleOf(conversation: ApiConversation): String =
        conversation.resolvedPreferences?.customName?.takeIf { it.isNotBlank() } ?: conversation.title.orEmpty()
}

private fun <T> NetworkResult<List<T>>.orEmpty(): List<T> = when (this) {
    is NetworkResult.Success -> data
    is NetworkResult.Failure -> emptyList()
}

private fun <T> NetworkResult<List<T>>.failureOrNull(): SearchPaneFailure? =
    if (this is NetworkResult.Failure) SearchPaneFailure.Unreachable else null
