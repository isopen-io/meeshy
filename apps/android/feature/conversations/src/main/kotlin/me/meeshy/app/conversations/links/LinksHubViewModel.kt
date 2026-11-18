package me.meeshy.app.conversations.links

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.link.LinkStatsRepository
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.model.LinkStatsSnapshot
import me.meeshy.sdk.model.links.LinksHubSummary
import me.meeshy.sdk.model.links.LinksProfileLink
import me.meeshy.sdk.model.profile.MyAddress
import me.meeshy.sdk.profile.MyAddressesRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

data class LinksHubUiState(
    val figures: LinkStatsSnapshot = LinkStatsSnapshot(),
    val isRefreshing: Boolean = false,
    /** Mon lien de profil et son QR ; `null` sans pseudo partageable. */
    val profileLink: LinksProfileLink? = null,
    /** « Mes adresses » ; vide tant que le serveur n'en sert pas : la section n'apparaît alors pas. */
    val addresses: List<MyAddress> = emptyList(),
)

/**
 * Le hub « Mes liens » : les quatre cartes se peignent d'abord du dernier tableau en cache, puis les
 * quatre sources se rechargent EN PARALLÈLE ([LinkStatsRepository.load]). Une source qui échoue garde
 * son ancien chiffre — jamais un zéro inventé. Mon lien de profil SUIT la session (aucune attente, et un pseudo changé change
 * le QR sans rechargement) ; « Mes adresses » se peignent du cache avant de se revalider ; un échec garde la liste d'avant.
 */
@HiltViewModel
class LinksHubViewModel @Inject constructor(
    private val stats: LinkStatsRepository,
    private val cache: LinksCache,
    private val addresses: MyAddressesRepository,
    private val session: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(
        LinksHubUiState(
            figures = cache.figures() ?: LinkStatsSnapshot(),
            profileLink = LinksProfileLink.from(session.currentUser.value?.username),
            addresses = addresses.cached().orEmpty(),
        ),
    )
    val state: StateFlow<LinksHubUiState> = _state.asStateFlow()

    private var job: Job? = null

    init {
        viewModelScope.launch {
            session.currentUser
                .map { LinksProfileLink.from(it?.username) }
                .distinctUntilChanged()
                .collect { link -> _state.update { it.copy(profileLink = link) } }
        }
        refresh()
    }

    fun refresh() {
        if (job?.isActive == true) return
        _state.update { it.copy(isRefreshing = true) }
        job = viewModelScope.launch {
            val freshAddresses = async { addresses.refresh() }
            val fresh = stats.load()
            val merged = LinksHubSummary.merge(_state.value.figures, fresh)
            cache.putFigures(merged)
            val served = freshAddresses.await()
            _state.update {
                it.copy(
                    figures = merged,
                    isRefreshing = false,
                    addresses = served ?: it.addresses,
                )
            }
        }
    }
}
