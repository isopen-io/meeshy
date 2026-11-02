package me.meeshy.app.community

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.model.Community
import me.meeshy.sdk.model.CommunityPaging
import me.meeshy.sdk.model.toCommunity
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

@Immutable
data class CommunityListUiState(
    val communities: List<Community> = emptyList(),
    val query: String = "",
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = false,
    val failed: Boolean = false,
) {
    /** Le squelette ne s'affiche qu'à froid : jamais un spinner par-dessus des communautés déjà là. */
    val showSkeleton: Boolean get() = communities.isEmpty() && isLoading
    val showError: Boolean get() = communities.isEmpty() && !isLoading && failed
    val showEmpty: Boolean get() = communities.isEmpty() && !isLoading && !failed
}

/**
 * La liste des communautés (iOS `CommunityListViewModel`). La première page se lit CACHE-FIRST
 * ([CommunityCacheRepository.list]) : le disque d'abord, la relecture réseau en arrière-plan, jamais
 * de spinner sur un cache non vide. Les pages suivantes et la recherche (dès deux caractères, après
 * un délai de frappe) interrogent la passerelle.
 */
@HiltViewModel
class CommunityListViewModel @Inject constructor(
    private val cache: CommunityCacheRepository,
    private val repository: CommunityRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(CommunityListUiState())
    val state: StateFlow<CommunityListUiState> = _state.asStateFlow()

    private var firstPage: List<Community> = emptyList()
    private var firstPageLoaded = false
    private var extraPages: List<Community> = emptyList()
    private var searchItems: List<Community> = emptyList()
    private var searchHasMore = false
    private var firstPageHasMore = false
    private var searchJob: Job? = null
    private var loadMoreJob: Job? = null

    private val searching: Boolean get() = CommunityPaging.searchQuery(_state.value.query) != null

    init {
        viewModelScope.launch {
            cache.list(onError = ::onFirstPageFailure).collect { result ->
                val items = result.valueOrNull?.map { it.toCommunity() } ?: return@collect
                firstPage = items
                firstPageLoaded = true
                if (extraPages.isEmpty()) firstPageHasMore = items.size >= PAGE_SIZE
                publish(failed = false)
            }
        }
    }

    fun onQueryChange(raw: String) {
        _state.update { it.copy(query = raw) }
        searchJob?.cancel()
        loadMoreJob?.cancel()
        if (!searching) {
            searchItems = emptyList()
            searchHasMore = false
            publish(isLoadingMore = false)
            return
        }
        _state.update { it.copy(isLoading = true) }
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MILLIS)
            runSearch(append = false)
        }
    }

    fun refresh() {
        if (_state.value.isRefreshing) return
        _state.update { it.copy(isRefreshing = true) }
        viewModelScope.launch {
            if (searching) {
                runSearch(append = false)
            } else {
                extraPages = emptyList()
                val ok = cache.refreshList()
                publish(failed = !ok && firstPage.isEmpty())
            }
            _state.update { it.copy(isRefreshing = false) }
        }
    }

    fun retry() {
        _state.update { it.copy(isLoading = true, failed = false) }
        viewModelScope.launch {
            val ok = if (searching) runSearch(append = false) else cache.refreshList()
            if (!ok) publish(failed = true)
        }
    }

    fun loadMore() {
        val current = _state.value
        if (!current.hasMore || current.isLoadingMore || current.isLoading) return
        publish(isLoadingMore = true)
        loadMoreJob = viewModelScope.launch {
            if (searching) runSearch(append = true) else runNextPage()
            publish(isLoadingMore = false)
        }
    }

    private suspend fun runNextPage() {
        val offset = (firstPage + extraPages).distinctBy { it.id }.size
        when (val result = repository.listPaged(offset = offset, limit = PAGE_SIZE)) {
            is NetworkResult.Success -> {
                extraPages = CommunityPaging.merge(extraPages, result.data.data.map { it.toCommunity() }, append = true) { it.id }
                firstPageHasMore = result.data.pagination?.hasMore ?: false
            }
            is NetworkResult.Failure -> Unit
        }
    }

    private suspend fun runSearch(append: Boolean): Boolean {
        val query = CommunityPaging.searchQuery(_state.value.query) ?: return true
        val offset = if (append) searchItems.size else 0
        return when (val result = repository.listPaged(search = query, offset = offset, limit = PAGE_SIZE)) {
            is NetworkResult.Success -> {
                val incoming = result.data.data.map { it.toCommunity() }
                searchItems = CommunityPaging.merge(searchItems, incoming, append) { it.id }
                searchHasMore = result.data.pagination?.hasMore ?: false
                publish(failed = false)
                true
            }
            is NetworkResult.Failure -> {
                publish(failed = searchItems.isEmpty())
                false
            }
        }
    }

    private fun onFirstPageFailure(@Suppress("UNUSED_PARAMETER") error: Throwable) {
        if (firstPage.isEmpty() && !searching) publish(failed = true)
    }

    private fun publish(failed: Boolean? = null, isLoadingMore: Boolean? = null) {
        val searchingNow = searching
        val items = if (searchingNow) searchItems else CommunityPaging.merge(firstPage, extraPages, append = true) { it.id }
        _state.update {
            it.copy(
                communities = items,
                hasMore = if (searchingNow) searchHasMore else firstPageHasMore,
                isLoading = if (searchingNow) false else !firstPageLoaded && !(failed ?: it.failed),
                failed = failed ?: it.failed,
                isLoadingMore = isLoadingMore ?: it.isLoadingMore,
            )
        }
    }

    private companion object {
        const val PAGE_SIZE = 20
        const val SEARCH_DEBOUNCE_MILLIS = 350L
    }
}
