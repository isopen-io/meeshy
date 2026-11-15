package me.meeshy.app.conversations

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.link.LinkCacheRepository
import me.meeshy.sdk.model.ShareLinkStatsState
import javax.inject.Inject

/**
 * Les chiffres d'UN lien (visites, arrivées, langues, récents) pour la fiche : cache d'abord,
 * rafraîchissement silencieux derrière. Sur cache vide, un échec passe « chargement » à « indisponible ».
 */
@HiltViewModel
class ShareLinkStatsViewModel @Inject constructor(
    repository: LinkCacheRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val refreshFailed = MutableStateFlow(false)

    val state: StateFlow<ShareLinkStatsState> = combine(
        repository.stats(savedStateHandle[ShareLinkDetailViewModel.LINK_ID_ARG] ?: "") { refreshFailed.value = true },
        refreshFailed,
    ) { result, failed -> ShareLinkStatsState.of(result.valueOrNull, failed) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ShareLinkStatsState.Loading)
}
