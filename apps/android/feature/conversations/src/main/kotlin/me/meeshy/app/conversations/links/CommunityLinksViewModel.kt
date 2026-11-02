package me.meeshy.app.conversations.links

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.link.CommunityLinkRepository
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.model.CommunityLink
import me.meeshy.sdk.model.CommunityLinkStats
import me.meeshy.sdk.model.links.toStats
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

data class CommunityLinksUiState(
    val links: List<CommunityLink> = emptyList(),
    val hasLoaded: Boolean = false,
    val isRefreshing: Boolean = false,
    val refreshFailed: Boolean = false,
) {
    val stats: CommunityLinkStats get() = links.toStats()
}

/** Les communautés administrées comme liens de partage (iOS `CommunityLinksViewModel`) : cache d'abord, puis revalidation. */
@HiltViewModel
class CommunityLinksViewModel @Inject constructor(
    private val repository: CommunityLinkRepository,
    private val cache: LinksCache,
) : ViewModel() {

    private val cached = cache.communityLinks()
    private val _state = MutableStateFlow(CommunityLinksUiState(links = cached.orEmpty(), hasLoaded = cached != null))
    val state: StateFlow<CommunityLinksUiState> = _state.asStateFlow()

    private var job: Job? = null

    init {
        refresh()
    }

    fun refresh() {
        if (job?.isActive == true) return
        _state.update { it.copy(isRefreshing = true) }
        job = viewModelScope.launch {
            val fetched = (repository.listCommunityLinks() as? NetworkResult.Success)?.data
            fetched?.let(cache::putCommunityLinks)
            _state.update { current ->
                current.copy(
                    links = fetched ?: current.links,
                    hasLoaded = current.hasLoaded || fetched != null,
                    isRefreshing = false,
                    refreshFailed = fetched == null,
                )
            }
        }
    }
}

/** La fiche d'une communauté : lue dans le cache de la liste ; hors cache (ouverture directe), la liste est rechargée. */
@HiltViewModel
class CommunityLinkDetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repository: CommunityLinkRepository,
    private val cache: LinksCache,
) : ViewModel() {

    private val id: String = savedState.get<String>(COMMUNITY_ID_ARG).orEmpty()

    private val _link = MutableStateFlow(cache.communityLinks()?.firstOrNull { it.id == id })
    val link: StateFlow<CommunityLink?> = _link.asStateFlow()

    private val _notFound = MutableStateFlow(false)
    val notFound: StateFlow<Boolean> = _notFound.asStateFlow()

    init {
        if (_link.value == null) {
            viewModelScope.launch {
                val fetched = (repository.listCommunityLinks() as? NetworkResult.Success)?.data
                fetched?.let(cache::putCommunityLinks)
                val found = fetched?.firstOrNull { it.id == id }
                _link.value = found
                _notFound.value = found == null
            }
        }
    }

    companion object {
        const val COMMUNITY_ID_ARG = "communityId"
    }
}
