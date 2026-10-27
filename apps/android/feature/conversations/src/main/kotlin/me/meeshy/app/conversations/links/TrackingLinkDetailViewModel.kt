package me.meeshy.app.conversations.links

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.link.TrackedLinkRepository
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.TrackingLinkClick
import me.meeshy.sdk.model.links.ClicksBreakdown
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

data class TrackingDetailUiState(
    /** `null` tant que ni le cache de la liste ni la réponse des clics ne l'ont apporté. */
    val link: TrackingLink? = null,
    val clicks: List<TrackingLinkClick> = emptyList(),
    val breakdown: ClicksBreakdown = ClicksBreakdown.of(emptyList(), 0),
    val isLoadingClicks: Boolean = false,
    val loadFailed: Boolean = false,
    val isDeleting: Boolean = false,
    val deleteFailed: Boolean = false,
)

/**
 * La fiche d'un lien de suivi (iOS `TrackingLinkDetailView` + `TrackingDetailViewModel`) : le lien se
 * peint d'abord depuis le cache de la liste, les clics et les répartitions arrivent ensuite. La
 * suppression attend le serveur (la fiche se ferme dessus) : un refus reste affiché, rien n'est perdu.
 */
@HiltViewModel
class TrackingLinkDetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repository: TrackedLinkRepository,
    private val cache: LinksCache,
) : ViewModel() {

    private val token: String = savedState.get<String>(TOKEN_ARG).orEmpty()

    private val _state = MutableStateFlow(
        TrackingDetailUiState(link = cache.trackingLinks()?.firstOrNull { it.token == token }, isLoadingClicks = true),
    )
    val state: StateFlow<TrackingDetailUiState> = _state.asStateFlow()

    private val _events = Channel<LinkEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(isLoadingClicks = true, loadFailed = false) }
        viewModelScope.launch {
            when (val result = repository.clicks(token)) {
                is NetworkResult.Success -> {
                    val link = result.data.link
                    _state.update {
                        it.copy(
                            link = link,
                            clicks = result.data.clicks,
                            breakdown = ClicksBreakdown.of(result.data.clicks, link.totalClicks),
                            isLoadingClicks = false,
                        )
                    }
                }
                is NetworkResult.Failure -> _state.update { it.copy(isLoadingClicks = false, loadFailed = true) }
            }
        }
    }

    fun delete() {
        if (_state.value.isDeleting) return
        _state.update { it.copy(isDeleting = true, deleteFailed = false) }
        viewModelScope.launch {
            when (repository.delete(token)) {
                is NetworkResult.Success -> {
                    cache.trackingLinks()?.let { held -> cache.putTrackingLinks(held.filterNot { it.token == token }) }
                    _events.send(LinkEvent.Removed)
                }
                is NetworkResult.Failure -> {
                    _state.update { it.copy(isDeleting = false, deleteFailed = true) }
                    _events.send(LinkEvent.RemoveFailed)
                }
            }
        }
    }

    companion object {
        const val TOKEN_ARG = "token"
    }
}
