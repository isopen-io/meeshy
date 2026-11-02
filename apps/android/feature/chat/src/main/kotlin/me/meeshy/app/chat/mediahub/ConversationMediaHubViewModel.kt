package me.meeshy.app.chat.mediahub

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.mediahub.ConversationMediaHubRepository
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.auth.ServerEnvironmentResolver
import me.meeshy.sdk.model.mediahub.ConversationMediaHubRules
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.model.mediahub.MediaHubItem
import me.meeshy.sdk.model.mediahub.MediaHubPayload
import me.meeshy.sdk.model.mediahub.MediaHubRendering
import me.meeshy.sdk.model.mediahub.MediaHubRowExit
import me.meeshy.sdk.model.mediahub.MediaHubRowRules
import me.meeshy.sdk.model.mediahub.MediaHubPhase
import me.meeshy.sdk.model.mediahub.MediaHubSegment
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.util.resolveMediaUrl

/** Ce que l'écran lit : le segment courant (ou sa recherche), projeté en éléments prêts à peindre. */
@Immutable
data class MediaHubUiState(
    val selectedKind: ConversationMediaKind = ConversationMediaKind.VISUAL,
    val items: List<MediaHubItem> = emptyList(),
    val phase: MediaHubPhase = MediaHubPhase.LOADING,
    val canLoadMore: Boolean = false,
    val isLoadingMore: Boolean = false,
    val loadMoreFailed: Boolean = false,
    val activeQuery: String? = null,
)

/**
 * Le modèle de l'écran « Médias, liens et documents » (miroir de `ConversationMediaHubViewModel` iOS).
 * CACHE D'ABORD (l'index du genre se peint avant le réseau, la tête se revalide en silence), PAGINÉ par `before`
 * quand la liste touche sa fin (jamais deux pages à la fois), HORS LIGNE lisible, RECHERCHE locale immédiate puis
 * serveur. Ne tient que des métadonnées : les octets d'un média ne se téléchargent qu'à son ouverture.
 */
@HiltViewModel
class ConversationMediaHubViewModel @Inject constructor(
    private val repository: ConversationMediaHubRepository,
    private val index: ConversationMediaHubIndex,
    private val session: SessionRepository,
    config: MeeshyConfig,
) : ViewModel() {

    private val apiBaseUrl: String = config.apiBaseUrl

    private val webOrigin: String =
        ServerEnvironmentResolver.webOrigin(ServerEnvironmentResolver.serverOrigin(config.apiBaseUrl))

    private val resolveMedia: (String) -> String = { url -> resolveMediaUrl(url, apiBaseUrl) }

    private val _state = MutableStateFlow(MediaHubUiState())
    val state: StateFlow<MediaHubUiState> = _state.asStateFlow()

    private var conversationId: String? = null
    private var selectedKind = ConversationMediaKind.VISUAL
    private val segments = HashMap<ConversationMediaKind, MediaHubSegment>()
    private var search: Pair<String, MediaHubSegment>? = null
    private var loadJob: Job? = null
    private var searchJob: Job? = null

    /** Ouvre l'écran sur une conversation ; sans effet si elle est déjà ouverte. */
    fun start(id: String) {
        if (conversationId == id) return
        conversationId = id
        segments.clear()
        search = null
        select(selectedKind)
    }

    fun select(kind: ConversationMediaKind) {
        selectedKind = kind
        publish()
        search?.first?.let { runSearch(it) }
        if (segments[kind]?.opened == true) return
        loadJob?.cancel()
        loadJob = viewModelScope.launch { open(kind) }
    }

    fun loadMore() {
        val id = conversationId ?: return
        val activeSearch = search
        if (activeSearch != null) {
            val next = activeSearch.second.startLoadMore() ?: return
            search = activeSearch.first to next
            publish()
            searchJob = viewModelScope.launch { fetchSearch(id, activeSearch.first) }
            return
        }
        val kind = selectedKind
        val next = segments[kind]?.startLoadMore() ?: return
        segments[kind] = next
        publish()
        viewModelScope.launch { fetch(id, kind) }
    }

    fun retry() {
        val kind = selectedKind
        val current = search
        if (current != null) {
            runSearch(current.first)
            return
        }
        segments[kind] = (segments[kind] ?: MediaHubSegment()).retry()
        publish()
        loadJob?.cancel()
        loadJob = viewModelScope.launch { open(kind) }
    }

    /** La frappe : la recherche part après une courte pause, chaque frappe ANNULE la précédente. */
    fun updateQuery(text: String) {
        searchJob?.cancel()
        val trimmed = text.trim()
        if (trimmed.length < ConversationMediaKind.MINIMUM_SEARCH_LENGTH) {
            search = null
            publish()
            return
        }
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            runSearch(trimmed)
        }
    }

    private suspend fun open(kind: ConversationMediaKind) {
        val id = conversationId ?: return
        val cached = index.read(id, kind)
        val seeded = (segments[kind] ?: MediaHubSegment()).withCache(cached?.carriers.orEmpty(), cached?.isComplete == true)
        segments[kind] = seeded
        publish()
        if (seeded.needsNetworkOnOpen) fetch(id, kind)
    }

    private suspend fun fetch(id: String, kind: ConversationMediaKind) {
        val segment = segments[kind] ?: return
        val ticket = index.ticket()
        val result = repository.page(id, kind, query = null, before = segment.before, languages = readerPrism())
        if (conversationId != id) return
        val current = segments[kind] ?: return
        segments[kind] = when (result) {
            is NetworkResult.Success -> {
                val page = result.data
                val next = current.pageArrived(page.carriers, page.nextCursor, page.hasMore)
                index.merge(id, kind, page.carriers, complete = next.isComplete, ticket = ticket)
                next
            }
            is NetworkResult.Failure -> current.failed(offline = result.error.isOffline())
        }
        publish()
    }

    private fun runSearch(query: String) {
        val id = conversationId ?: return
        val kind = selectedKind
        val known = segments[kind]?.carriers.orEmpty().filter { ConversationMediaHubRules.matches(it, query) }
        search = query to MediaHubSegment(
            carriers = known,
            phase = if (known.isEmpty()) MediaHubPhase.LOADING else MediaHubPhase.LOADED,
            opened = true,
        )
        publish()
        searchJob?.cancel()
        searchJob = viewModelScope.launch { fetchSearch(id, query) }
    }

    private suspend fun fetchSearch(id: String, query: String) {
        val kind = selectedKind
        val (_, segment) = search?.takeIf { it.first == query } ?: return
        val result = repository.page(id, kind, query, segment.before, readerPrism())
        val current = search?.takeIf { it.first == query && selectedKind == kind } ?: return
        search = query to when (result) {
            is NetworkResult.Success -> current.second.pageArrived(result.data.carriers, result.data.nextCursor, result.data.hasMore)
            is NetworkResult.Failure -> current.second.failed(offline = result.error.isOffline())
        }
        publish()
    }

    private fun publish() {
        val kind = selectedKind
        val activeSearch = search
        val segment = activeSearch?.second ?: segments[kind] ?: MediaHubSegment()
        _state.value = MediaHubUiState(
            selectedKind = kind,
            items = ConversationMediaHubRules.items(segment.carriers, kind, System.currentTimeMillis(), webOrigin)
                .map { it.resolvingMedia(resolveMedia) },
            phase = segment.phase,
            canLoadMore = segment.canLoadMore,
            isLoadingMore = segment.isLoadingMore,
            loadMoreFailed = segment.loadMoreFailed,
            activeQuery = activeSearch?.first,
        )
    }

    private fun readerPrism(): List<String> {
        val user = session.currentUser.value
        return if (user == null) listOfNotNull(Locale.getDefault().language.takeIf { it.isNotBlank() })
        else ReaderPrism.resolve(user, Locale.getDefault())
    }

    /** Hors ligne : la requête n'a pas atteint le serveur (aucun statut HTTP), à la différence d'un refus. */
    private fun ApiError.isOffline(): Boolean = httpStatus == null

    /** Ce que le porteur de [item] laisse sortir — fermé tant que le porteur est inconnu (#9573, #9574). */
    fun rowExit(item: MediaHubItem, isEndToEnd: Boolean): MediaHubRowExit =
        MediaHubRowExit.of(carrier(item.messageId), isEndToEnd)

    /** Ce que devient l'appui sur un élément hors visionneuse : jamais une adresse ouverte telle quelle, jamais une sortie refusée. */
    internal fun launchFor(item: MediaHubItem, isEndToEnd: Boolean): MediaHubLaunch =
        mediaHubLaunchFor(item.payload, apiBaseUrl, resolveMedia, rowExit(item, isEndToEnd))

    /** Le rendu d'une rangée : la même carte que le fil pour le même genre. */
    fun rendering(item: MediaHubItem): MediaHubRendering = MediaHubRowRules.rendering(item, webOrigin)

    /** Le porteur d'un élément affiché — pour les portillons de sortie et « aller au message ». */
    fun carrier(messageId: String): ApiMessage? =
        (search?.second ?: segments[selectedKind])?.carriers?.firstOrNull { it.id == messageId }

    override fun onCleared() {
        loadJob?.cancel()
        searchJob?.cancel()
    }

    private companion object {
        const val SEARCH_DEBOUNCE_MS: Long = 300
    }
}
