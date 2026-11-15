package me.meeshy.app.conversations

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.link.LinkCacheRepository
import me.meeshy.sdk.model.ShareLinkArrivalsListState
import me.meeshy.sdk.model.ShareLinkArrivalsRetry
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/**
 * La liste COMPLÈTE des arrivées d'un lien (iOS `ShareLinkArrivalsListViewModel`). Peinte d'abord des
 * arrivées récentes que la fiche a déjà en cache, puis remplacée par la première page serveur ; la
 * logique d'états est la loi pure [ShareLinkArrivalsListState].
 */
@HiltViewModel
class ShareLinkArrivalsViewModel @Inject constructor(
    private val repository: LinkCacheRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val linkId: String = savedStateHandle[ShareLinkDetailViewModel.LINK_ID_ARG] ?: ""

    private val _state = MutableStateFlow(ShareLinkArrivalsListState())
    val state: StateFlow<ShareLinkArrivalsListState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val cached = repository.stats(linkId).first().valueOrNull
            if (cached != null) _state.update { it.withSeed(cached.arrivals, cached.recentArrivals) }
        }
        loadFirstPage()
    }

    fun loadFirstPage() {
        if (!_state.value.canRequestFirstPage) return
        _state.value = _state.value.firstPageRequested()
        val generation = _state.value.generation
        viewModelScope.launch {
            val next = when (val result = fetch(cursor = null)) {
                is NetworkResult.Success -> { s: ShareLinkArrivalsListState -> s.firstPageLoaded(generation, result.data) }
                is NetworkResult.Failure -> { s: ShareLinkArrivalsListState -> s.firstPageFailedAt(generation) }
            }
            _state.value = next(_state.value)
        }
    }

    fun loadNextPage() {
        val before = _state.value
        if (!before.canRequestNextPage) return
        _state.value = before.nextPageRequested()
        val generation = before.generation
        viewModelScope.launch {
            val next = when (val result = fetch(cursor = before.nextCursor)) {
                is NetworkResult.Success -> { s: ShareLinkArrivalsListState -> s.nextPageLoaded(generation, result.data) }
                is NetworkResult.Failure -> { s: ShareLinkArrivalsListState -> s.nextPageFailedAt(generation) }
            }
            _state.value = next(_state.value)
        }
    }

    /** Une ligne apparaît : près de la fin, la suite se demande. */
    fun onRowShown(index: Int) {
        if (_state.value.shouldPrefetchAt(index)) loadNextPage()
    }

    fun retry() = when (_state.value.retryTarget) {
        ShareLinkArrivalsRetry.FirstPage -> loadFirstPage()
        ShareLinkArrivalsRetry.NextPage -> loadNextPage()
    }

    private suspend fun fetch(cursor: String?) = try {
        repository.arrivalsPage(linkId, cursor, ShareLinkArrivalsListState.PAGE_SIZE)
    } catch (e: CancellationException) {
        throw e
    }
}
