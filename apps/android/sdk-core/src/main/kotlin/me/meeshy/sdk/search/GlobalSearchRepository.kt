package me.meeshy.sdk.search

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
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

/** Un message trouve, accompagne du titre de sa conversation pour l'affichage. */
public data class MessageSearchHit(
    val message: ApiMessage,
    val conversationTitle: String,
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
 * Recherche globale — parite iOS `GlobalSearchViewModel.performSearch`.
 *
 * Le gateway n'a PAS d'endpoint unifie : trois volets tournent en parallele
 * (conversations par titre/participant, utilisateurs, et messages par eventail
 * sur les [maxMessageConversations] premieres conversations trouvees). Chaque
 * volet en echec degrade a la liste vide — une recherche ne montre jamais
 * d'erreur bloquante, elle montre ce qu'elle a trouve.
 *
 * Building block SDK : politique d'appel parametree, aucun etat, aucun debounce —
 * le "quand chercher" appartient au ViewModel appelant.
 */
@Singleton
public class GlobalSearchRepository @Inject constructor(
    private val conversationApi: ConversationApi,
    private val userApi: UserApi,
    private val messageApi: MessageApi,
) {
    public suspend fun search(
        query: String,
        maxMessageConversations: Int = 10,
        messagesPerConversation: Int = 5,
        userLimit: Int = 20,
    ): GlobalSearchResults = coroutineScope {
        val conversationsDeferred = async {
            apiCall { conversationApi.search(query) }.orEmpty()
        }
        val usersDeferred = async {
            apiCall { userApi.search(query, limit = userLimit, offset = 0) }.orEmpty()
        }

        val conversations = conversationsDeferred.await()
        val messageBatches = conversations
            .take(maxMessageConversations)
            .map { conversation ->
                async {
                    apiCall { messageApi.search(conversation.id, query, limit = messagesPerConversation) }
                        .orEmpty()
                        .map { message ->
                            MessageSearchHit(
                                message = message,
                                conversationTitle = conversation.title ?: "",
                            )
                        }
                }
            }
            .map { it.await() }

        GlobalSearchResults(
            conversations = conversations,
            users = usersDeferred.await(),
            messages = mergeMessageHits(messageBatches),
        )
    }
}

private fun <T> NetworkResult<List<T>>.orEmpty(): List<T> = when (this) {
    is NetworkResult.Success -> data
    is NetworkResult.Failure -> emptyList()
}
