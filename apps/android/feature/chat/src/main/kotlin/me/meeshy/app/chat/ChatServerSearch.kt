package me.meeshy.app.chat

import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.MessageSearchException
import me.meeshy.sdk.model.search.ConversationSearchResult
import me.meeshy.sdk.model.search.ConversationSearchResults
import me.meeshy.sdk.model.search.SearchMatchType

/** L'état de la recherche serveur de la conversation ; [query] est la requête rognée en cours, `null` si inerte. */
data class ChatServerSearchState(
    val query: String? = null,
    val results: List<ConversationSearchResult> = emptyList(),
    val isSearching: Boolean = false,
    val hasMore: Boolean = false,
    /** La première page a échoué (serveur joint, réponse en erreur) : « Réessayer ». */
    val failed: Boolean = false,
    /** Serveur injoignable : les résultats sont les seuls résultats locaux, sans erreur. */
    val isOffline: Boolean = false,
    /** Le panneau des résultats est ouvert (refermé par le saut vers un résultat). */
    val panelOpen: Boolean = false,
) {
    val showsEmpty: Boolean get() = query != null && !isSearching && !failed && results.isEmpty()
}

/**
 * La recherche serveur d'une conversation (iOS `ConversationSearchHandler`) : une requête rognée d'au moins
 * deux caractères interroge `messages/search` par pages de 20, dont les messages rejoignent Room ; la suite se
 * charge au défilement des résultats ; une requête périmée est annulée. Hors ligne, seuls les résultats locaux
 * du fil chargé sont rendus. L'état vit ICI : [ChatUiState] n'en porte aucun champ.
 */
class ChatServerSearch @Inject constructor(
    private val messages: MessageRepository,
) : ChatController {

    private val mutable = MutableStateFlow(ChatServerSearchState())
    val state: StateFlow<ChatServerSearchState> = mutable.asStateFlow()

    private var host: ChatControllerHost? = null
    private var job: Job? = null
    private var cursor: String? = null
    private var generation = 0

    override fun attach(host: ChatControllerHost) {
        this.host = host
    }

    override fun detach() {
        job?.cancel()
        host = null
    }

    /** Une nouvelle saisie : annule la requête en vol, puis interroge le serveur si la requête est cherchable. */
    fun onQuery(query: String) {
        generation++
        job?.cancel()
        cursor = null
        val searchable = ConversationSearchResults.searchable(query)
        if (searchable == null) {
            mutable.value = ChatServerSearchState()
            return
        }
        mutable.update { it.copy(query = searchable, results = emptyList(), isSearching = true, hasMore = false, failed = false, isOffline = false, panelOpen = true) }
        job = launchPage(searchable, after = null, debounce = true)
    }

    /** La suite des résultats, déclenchée au bout de la liste. Sans effet sans curseur vivant ni pendant un chargement. */
    fun loadMore() {
        val current = mutable.value
        val query = current.query ?: return
        if (!current.hasMore || current.isSearching || cursor == null) return
        mutable.update { it.copy(isSearching = true) }
        job = launchPage(query, after = cursor, debounce = false)
    }

    /** Rejoue la requête courante après un échec. */
    fun retry() {
        mutable.value.query?.let(::onQuery)
    }

    /** Referme le panneau des résultats (le saut vers un résultat) sans perdre la requête. */
    fun closePanel() {
        mutable.update { it.copy(panelOpen = false) }
    }

    private fun launchPage(query: String, after: String?, debounce: Boolean): Job? {
        val scope = host?.scope ?: return null
        val mine = generation
        return scope.launch {
            try {
                if (debounce) delay(DEBOUNCE_MS)
                val page = messages.searchMessages(host?.conversationId.orEmpty(), query, after, ConversationSearchResults.PAGE_SIZE)
                if (mine != generation) return@launch
                cursor = page.nextCursor
                val fresh = page.messages.map { ConversationSearchResults.from(it, query) }
                mutable.update {
                    it.copy(results = (it.results + fresh).distinctBy(ConversationSearchResult::id), isSearching = false, hasMore = page.hasMore && page.nextCursor != null)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: MessageSearchException) {
                if (mine == generation) fail(query, after, unreachable = e.unreachable)
            } catch (e: Exception) {
                if (mine == generation) fail(query, after, unreachable = false)
            }
        }
    }

    private fun fail(query: String, after: String?, unreachable: Boolean) {
        if (after != null) {
            mutable.update { it.copy(isSearching = false) }
            return
        }
        mutable.update {
            if (unreachable) it.copy(results = localResults(query), isSearching = false, hasMore = false, isOffline = true)
            else it.copy(isSearching = false, failed = true)
        }
    }

    private fun localResults(query: String): List<ConversationSearchResult> {
        val ui = host?.uiState?.value ?: return emptyList()
        val ids = ui.search.matchIds.toSet()
        return ui.messages.filter { it.messageId in ids }.map { bubble ->
            ConversationSearchResult(
                id = bubble.messageId,
                conversationId = ui.conversationId,
                content = bubble.text,
                matchedText = bubble.text,
                matchType = SearchMatchType.CONTENT,
                senderName = bubble.senderName ?: "?",
                senderAvatar = bubble.senderAvatarUrl,
                createdAtIso = bubble.createdAtIso,
            )
        }
    }

    private companion object {
        const val DEBOUNCE_MS = 250L
    }
}
