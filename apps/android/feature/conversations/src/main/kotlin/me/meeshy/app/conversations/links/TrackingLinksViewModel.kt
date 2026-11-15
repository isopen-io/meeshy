package me.meeshy.app.conversations.links

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.link.TrackingLinkRepository
import me.meeshy.sdk.model.TrackingLinkStats
import me.meeshy.sdk.model.links.CreateTrackingLinkForm
import me.meeshy.sdk.model.links.TrackingLinksState
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

data class TrackingLinksUiState(
    val links: TrackingLinksState = TrackingLinksState(),
    val stats: TrackingLinkStats? = null,
    /** `false` tant que ni le cache ni le réseau n'ont répondu : seul cet état dessine le squelette. */
    val hasLoaded: Boolean = false,
    val isRefreshing: Boolean = false,
    val refreshFailed: Boolean = false,
    val createSheet: TrackingCreateSheet? = null,
)

data class TrackingCreateSheet(
    val form: CreateTrackingLinkForm = CreateTrackingLinkForm(),
    val isCreating: Boolean = false,
    val error: String? = null,
)

sealed interface LinkEvent {
    data object Created : LinkEvent
    data object Removed : LinkEvent
    data object RemoveFailed : LinkEvent
}

/**
 * Les liens de suivi (iOS `TrackingLinksViewModel`) : cache-first, revalidation silencieuse, liste et
 * chiffres chargés ensemble. Une création réussie s'insère en tête au même instant (optimiste côté
 * liste : le serveur a répondu, l'écran n'attend rien d'autre) et rafraîchit les chiffres.
 */
@HiltViewModel
class TrackingLinksViewModel @Inject constructor(
    private val repository: TrackingLinkRepository,
    private val cache: LinksCache,
) : ViewModel() {

    private val cached = cache.trackingLinks()
    private val _state = MutableStateFlow(
        TrackingLinksUiState(links = TrackingLinksState(cached.orEmpty()), hasLoaded = cached != null),
    )
    val state: StateFlow<TrackingLinksUiState> = _state.asStateFlow()

    private val _events = Channel<LinkEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    private var job: Job? = null

    init {
        refresh()
    }

    /** Retour sur l'écran (après une suppression depuis la fiche) : le cache fait foi, puis revalidation. */
    fun onResumed() {
        cache.trackingLinks()?.let { held ->
            if (held != _state.value.links.links) _state.update { it.copy(links = TrackingLinksState(held), hasLoaded = true) }
        }
        refresh()
    }

    fun refresh() {
        if (job?.isActive == true) return
        _state.update { it.copy(isRefreshing = true) }
        job = viewModelScope.launch {
            val (list, stats) = coroutineScope {
                val l = async { repository.listLinks() }
                val s = async { repository.fetchStats() }
                l.await() to s.await()
            }
            val fetched = (list as? NetworkResult.Success)?.data
            fetched?.let(cache::putTrackingLinks)
            _state.update { current ->
                current.copy(
                    links = fetched?.let { TrackingLinksState(it) } ?: current.links,
                    stats = (stats as? NetworkResult.Success)?.data ?: current.stats,
                    hasLoaded = current.hasLoaded || fetched != null,
                    isRefreshing = false,
                    refreshFailed = fetched == null,
                )
            }
        }
    }

    fun openCreate() = _state.update { it.copy(createSheet = TrackingCreateSheet()) }

    fun dismissCreate() = _state.update { it.copy(createSheet = null) }

    fun editForm(transform: (CreateTrackingLinkForm) -> CreateTrackingLinkForm) = _state.update { current ->
        current.copy(createSheet = current.createSheet?.let { it.copy(form = transform(it.form), error = null) })
    }

    fun create() {
        val sheet = _state.value.createSheet ?: return
        val request = sheet.form.request() ?: return
        if (sheet.isCreating) return
        _state.update { it.copy(createSheet = sheet.copy(isCreating = true, error = null)) }
        viewModelScope.launch {
            when (val result = repository.createLink(request)) {
                is NetworkResult.Success -> {
                    val next = _state.value.links.prepended(result.data)
                    cache.putTrackingLinks(next.links)
                    _state.update { it.copy(links = next, createSheet = null) }
                    _events.send(LinkEvent.Created)
                    repository.fetchStats().getOrNull()?.let { fresh -> _state.update { it.copy(stats = fresh) } }
                }
                is NetworkResult.Failure -> _state.update { current ->
                    current.copy(createSheet = current.createSheet?.copy(isCreating = false, error = result.error.message))
                }
            }
        }
    }
}
