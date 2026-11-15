package me.meeshy.app.conversations.links

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.link.LinkStatsRepository
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.model.LinkStatsSnapshot
import me.meeshy.sdk.model.links.LinksHubSummary
import javax.inject.Inject

data class LinksHubUiState(
    val figures: LinkStatsSnapshot = LinkStatsSnapshot(),
    val isRefreshing: Boolean = false,
)

/**
 * Le hub « Mes liens » : les quatre cartes se peignent d'abord du dernier tableau en cache, puis les
 * quatre sources se rechargent EN PARALLÈLE ([LinkStatsRepository.load]). Une source qui échoue garde
 * son ancien chiffre — jamais un zéro inventé.
 */
@HiltViewModel
class LinksHubViewModel @Inject constructor(
    private val stats: LinkStatsRepository,
    private val cache: LinksCache,
) : ViewModel() {

    private val _state = MutableStateFlow(LinksHubUiState(figures = cache.figures() ?: LinkStatsSnapshot()))
    val state: StateFlow<LinksHubUiState> = _state.asStateFlow()

    private var job: Job? = null

    init {
        refresh()
    }

    fun refresh() {
        if (job?.isActive == true) return
        _state.update { it.copy(isRefreshing = true) }
        job = viewModelScope.launch {
            val fresh = stats.load()
            val merged = LinksHubSummary.merge(_state.value.figures, fresh)
            cache.putFigures(merged)
            _state.update { LinksHubUiState(figures = merged, isRefreshing = false) }
        }
    }
}
