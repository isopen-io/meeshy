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

/**
 * La rangée « Actif » de la fiche (#20255, iOS `CommunityLinkDetailViewModel.joinLinkPaused`) : [paused] nul quand la
 * passerelle ne sert pas l'état, et la fiche n'offre alors aucune bascule.
 */
data class CommunityJoinLinkUi(
    val paused: Boolean? = null,
    val communityActive: Boolean = true,
    val isSetting: Boolean = false,
    val failed: Boolean = false,
) {
    val canPause: Boolean get() = paused != null

    /** « Actif » sur le billet : la communauté l'est, et son lien n'est pas en pause. */
    val isLinkActive: Boolean get() = communityActive && paused != true
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

    private val _joinLink = MutableStateFlow(_link.value.joinLinkUi())
    val joinLink: StateFlow<CommunityJoinLinkUi> = _joinLink.asStateFlow()

    init {
        if (_link.value == null) {
            viewModelScope.launch {
                val fetched = (repository.listCommunityLinks() as? NetworkResult.Success)?.data
                fetched?.let(cache::putCommunityLinks)
                val found = fetched?.firstOrNull { it.id == id }
                _link.value = found
                _notFound.value = found == null
                if (!_joinLink.value.isSetting) _joinLink.value = found.joinLinkUi()
            }
        }
    }

    /**
     * Optimiste : le lien se met en pause (ou repart) tout de suite ; la réponse de la passerelle fait foi, un refus
     * remet l'état d'avant, et un second toucher en vol n'envoie rien.
     */
    fun setJoinLinkActive(active: Boolean) {
        val current = _joinLink.value
        val previous = current.paused ?: return
        val paused = !active
        if (current.isSetting || previous == paused) return
        _joinLink.value = current.copy(paused = paused, isSetting = true, failed = false)
        viewModelScope.launch {
            val written = (repository.setJoinLinkPaused(id, paused) as? NetworkResult.Success)?.data
            _joinLink.update { it.copy(paused = written ?: previous, isSetting = false, failed = written == null) }
            written?.let { rememberPaused(it) }
        }
    }

    private fun rememberPaused(paused: Boolean) {
        _link.update { it?.copy(joinLinkPaused = paused) }
        cache.communityLinks()?.let { links ->
            cache.putCommunityLinks(links.map { if (it.id == id) it.copy(joinLinkPaused = paused) else it })
        }
    }

    companion object {
        const val COMMUNITY_ID_ARG = "communityId"
    }
}

private fun CommunityLink?.joinLinkUi(): CommunityJoinLinkUi =
    CommunityJoinLinkUi(paused = this?.joinLinkPaused, communityActive = this?.isActive ?: true)
