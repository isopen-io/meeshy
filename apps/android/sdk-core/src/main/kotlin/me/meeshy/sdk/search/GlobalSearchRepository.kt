package me.meeshy.sdk.search

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.MessageEncryptionGuard
import me.meeshy.sdk.model.search.SearchExcerpt
import me.meeshy.sdk.model.search.SearchMediaKind
import me.meeshy.sdk.model.search.GlobalMessageSearchHit
import me.meeshy.sdk.model.search.ListMessageSearch
import me.meeshy.sdk.model.search.SearchPane
import me.meeshy.sdk.model.search.SearchPaneFailure
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiPost
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
    /** La photo servie avec [conversationTitle] par la recherche unifiee, quand [conversation] est inconnue. */
    val conversationAvatar: String? = null,
    /** Floute (#16957) : la ligne se voile ; par defaut lu sur le message lui-meme, donc ferme. */
    val isVeiled: Boolean = MessageEncryptionGuard.isVeiled(message),
    /** Le media dont la transcription a repondu (#16958), peint en icone non actionnable. */
    val transcriptMedia: SearchMediaKind? = null,
) {
    /** L'extrait a peindre : jamais le texte d'un message voile. */
    val excerpt: SearchExcerpt get() = SearchExcerpt.of(message.content, isVeiled, transcriptMedia)
}

/**
 * Un resultat de `GET /messages/search` (#14619) : le texte servi par le Prisme du serveur, l'auteur,
 * et le titre et la photo que la passerelle elit ensemble. `null` pour un texte blanc
 * ([ListMessageSearch.hitOf], la loi de la section de la liste).
 */
internal fun GlobalMessageSearchHit.asMessageSearchHit(known: ApiConversation?): MessageSearchHit? {
    val served = ListMessageSearch.hitOf(this) ?: return null
    return MessageSearchHit(
        message = ApiMessage(
            id = id,
            conversationId = conversationId,
            content = served.text,
            createdAt = createdAt,
            messageType = messageType,
            sender = sender?.let { ApiMessageSender(id = it.id, userId = it.userId, displayName = it.displayName, username = it.username, avatar = it.avatar) },
        ),
        conversationTitle = served.conversationTitle,
        conversation = known,
        conversationAvatar = served.conversationAvatar,
        isVeiled = served.isVeiled,
        transcriptMedia = served.transcriptMedia,
    )
}

/** Le resultat des volets de la recherche globale, chacun degradable a vide. */
public data class GlobalSearchResults(
    val conversations: List<ApiConversation> = emptyList(),
    val users: List<UserSearchResult> = emptyList(),
    val messages: List<MessageSearchHit> = emptyList(),
    /** Posts, reels et stories visibles du lecteur (#14620), tels que la passerelle les sert. */
    val posts: List<ApiPost> = emptyList(),
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
 * Les volets tournent en parallele (conversations, utilisateurs, messages, publications).
 * Les publications (#14620) n'ont pas de copie locale : hors ligne, leur volet est vide. Chacun repond d'abord depuis l'appareil
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
    private val posts: PostSearchSource = NoPostSearch,
    private val userSearchCache: UserSearchCacheSource? = null,
    private val locks: ConversationLockStore? = null,
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
            val usersTicket = userSearchCache?.ticket()
            val remoteUsers = if (offline) null else async {
                apiCall { userApi.search(query, limit = userLimit, offset = 0) }
            }
            val remotePosts = if (offline) null else async { posts.search(query) }
            val remoteUnified = if (offline) null else async {
                apiCall { messageApi.searchAll(query, limit = ListMessageSearch.LIMIT) }
            }
            val localConversations = async { local.conversations(query) }
            val localUsers = async { local.users(query) }
            val replayedUsers = userSearchCache?.cached(query).orEmpty()
            val localMessages = async { local.messages(query) }

            val localUserItems = localUsers.await()
            val firstPaint = GlobalSearchSnapshot(
                conversations = SearchPane(localConversations.await()),
                users = SearchPane(SearchResultMerger.users(localUserItems, replayedUsers)),
                messages = SearchPane(visible(localMessages.await())),
                remoteSettled = offline,
                offline = offline,
            )
            emit(firstPaint)
            if (offline) return@coroutineScope

            val conversationsResult = remoteConversations!!.await()
            val usersResult = remoteUsers!!.await()
            if (usersResult is NetworkResult.Success) userSearchCache?.remember(query, usersResult.data, usersTicket)
            val conversations = SearchResultMerger.conversations(
                local = firstPaint.conversations.items,
                remote = conversationsResult.orEmpty(),
            )
            val titles = conversations.associate { it.id to titleOf(it) }
            val remoteMessages = unified(remoteUnified!!.await(), conversations, firstPaint.messages.items) ?: fanOut(
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
                        SearchResultMerger.users(
                            localUserItems,
                            if (usersResult is NetworkResult.Success) usersResult.data else replayedUsers,
                        ),
                        usersResult.failureOrNull().takeIf { replayedUsers.isEmpty() },
                    ),
                    posts = remotePosts!!.await(),
                    messages = SearchPane(
                        SearchResultMerger.messages(firstPaint.messages.items, visible(remoteMessages.items)),
                        remoteMessages.failure.takeIf { firstPaint.messages.items.isEmpty() && remoteMessages.items.isEmpty() },
                    ),
                    remoteSettled = true,
                    offline = false,
                ),
            )
        }
    }

    /**
     * La recherche unifiee couvre TOUTES les conversations du lecteur, pas seulement celles dont le nom
     * repond a la requete (parite iOS `ConversationMessageSearchService.remoteMessages`). `null` quand la
     * passerelle ne sert pas encore la route (`404`) : l'eventail par conversation prend le relais.
     */
    private suspend fun unified(
        result: NetworkResult<List<GlobalMessageSearchHit>>,
        found: List<ApiConversation>,
        localHits: List<MessageSearchHit>,
    ): SearchPane<MessageSearchHit>? = when (result) {
        is NetworkResult.Success -> {
            val byId = knownConversations(result.data.map { it.conversationId }.toSet(), found + localHits.mapNotNull { it.conversation })
            SearchPane(result.data.mapNotNull { it.asMessageSearchHit(byId[it.conversationId]) })
        }
        is NetworkResult.Failure ->
            if (result.error.httpStatus == HTTP_NOT_FOUND) null else SearchPane(emptyList(), SearchPaneFailure.Unreachable)
    }

    /**
     * La conversation que l'appareil connait gagne sur la carte servie : son titre et sa photo sont elus
     * contre le lecteur (#12569, `customName` compris), la carte de la passerelle ne l'est pas (#16485).
     */
    private suspend fun knownConversations(ids: Set<String>, inHand: List<ApiConversation>): Map<String, ApiConversation> {
        val held = inHand.filter { it.id in ids }.associateBy { it.id }
        val missing = ids - held.keys
        val cached = if (missing.isEmpty()) emptyList() else local.cachedConversations(missing)
        return held + cached.associateBy { it.id }
    }

    /** Une conversation verrouillee ne laisse rien paraitre de ses messages, comme dans la liste. */
    private fun visible(hits: List<MessageSearchHit>): List<MessageSearchHit> =
        locks?.let { store -> hits.filterNot { store.isLocked(it.message.conversationId) } } ?: hits

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

    private companion object {
        const val HTTP_NOT_FOUND = 404
    }
}

private fun <T> NetworkResult<List<T>>.orEmpty(): List<T> = when (this) {
    is NetworkResult.Success -> data
    is NetworkResult.Failure -> emptyList()
}

private fun <T> NetworkResult<List<T>>.failureOrNull(): SearchPaneFailure? =
    if (this is NetworkResult.Failure) SearchPaneFailure.Unreachable else null
