package me.meeshy.app.conversations

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.search.ListMessageHit
import me.meeshy.sdk.model.search.ListMessageSearch
import me.meeshy.sdk.model.search.ListMessageSearchState
import me.meeshy.sdk.search.ListMessageSearchSource
import me.meeshy.sdk.search.RemoteMessageSearch

/** Aucune source : la liste ne cherche pas dans les messages (tests, aperçus). */
internal object NoListMessageSearch : ListMessageSearchSource {
    override suspend fun local(query: String): List<ApiMessage> = emptyList()
    override suspend fun remote(query: String, conversationIds: List<String>): RemoteMessageSearch? = null
}

/**
 * La section « Messages » de la recherche de la liste des conversations (#14619) : débounce,
 * annulation à chaque frappe, l'appareil d'abord (index Room), puis le serveur, jamais
 * interrogé sur une conversation chiffrée de bout en bout. Les règles vivent dans
 * [ListMessageSearch] et [ListMessageSearchState] (`:core:model`) ; ce collaborateur n'en
 * porte que le « quand ».
 */
internal class ConversationListMessageSearcher(
    private val scope: CoroutineScope,
    private val source: ListMessageSearchSource,
    private val readerPrism: () -> List<String>,
    private val conversations: () -> List<ApiConversation>,
    private val isConcealed: (conversationId: String) -> Boolean = { false },
) {
    private val _state = MutableStateFlow(ListMessageSearchState.Idle)
    val state: StateFlow<ListMessageSearchState> = _state.asStateFlow()

    private var job: Job? = null

    fun onQueryChanged(raw: String) {
        val query = ListMessageSearch.queryOf(raw)
        job?.cancel()
        if (query == null) {
            _state.value = ListMessageSearchState.Idle
            return
        }
        job = scope.launch {
            delay(ListMessageSearch.DEBOUNCE_MS)
            search(query)
        }
    }

    private suspend fun search(query: String) {
        _state.update { it.started(query) }
        val prism = readerPrism()
        val local = visible(ListMessageSearch.hitsOf(source.local(query), prism))
        _state.update { it.withLocal(query, local, remotePending = true) }
        val targets = ListMessageSearch.remoteTargets(conversations().filterNot { isConcealed(it.id) })
        val remote = source.remote(query, targets)
        if (remote == null) {
            _state.update { it.withLocal(query, local, remotePending = false) }
            return
        }
        val served = visible(remote.served + ListMessageSearch.hitsOf(remote.messages, prism))
        _state.update { it.withRemote(query, local, served, remote.failed) }
    }

    /** Une conversation verrouillée ne laisse rien paraître de ses messages, pas même dans la recherche. */
    private fun visible(hits: List<ListMessageHit>): List<ListMessageHit> = hits.filterNot { isConcealed(it.conversationId) }
}
