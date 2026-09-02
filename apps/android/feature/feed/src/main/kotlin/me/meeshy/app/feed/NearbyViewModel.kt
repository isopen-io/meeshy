package me.meeshy.app.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * The geolocated discovery feed — port of iOS's Nearby screen. Loads posts around a
 * single coordinate (captured once by the host and handed to [loadNearby]) page by
 * page, projects each post through the shared [FeedPostBuilder] (Prisme resolution
 * matches the main feed), and never re-sorts what the gateway already ordered by
 * distance. Pull-to-refresh re-queries the same coordinates rather than requesting a
 * fresh GPS fix — a fresh fix is only re-requested explicitly from the error state.
 */
data class NearbyUiState(
    val posts: List<FeedPostPresentation> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isLocating: Boolean = false,
    val showSkeleton: Boolean = false,
    val hasMore: Boolean = true,
    val hasLocation: Boolean = false,
    val permissionDenied: Boolean = false,
    val locationUnavailable: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class NearbyViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
) : ViewModel() {

    private val listState = MutableStateFlow(NearbyListState())
    private val status = MutableStateFlow(NearbyStatus())
    private var lastLat: Double? = null
    private var lastLng: Double? = null

    private val _state = MutableStateFlow(NearbyUiState())
    val state: StateFlow<NearbyUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(listState, sessionRepository.currentUser, status) { list, user, st ->
                project(list, user, st)
            }.collect { projected -> _state.value = projected }
        }
    }

    /**
     * First page around ([lat], [lng]). A re-entrant call while a load is already in
     * flight, or once the list has already loaded (matching [BookmarksViewModel.loadInitial]),
     * is a no-op — [refresh] is the way to force a reload. Clears any prior
     * permission/location error, matching the fresh attempt the caller is making.
     */
    fun loadNearby(lat: Double, lng: Double, radiusKm: Double = DEFAULT_RADIUS_KM) {
        if (status.value.isLoading || listState.value.hasLoaded) return
        lastLat = lat
        lastLng = lng
        listState.value = NearbyListState()
        status.update {
            it.copy(
                isLoading = true,
                isLocating = false,
                error = null,
                permissionDenied = false,
                locationUnavailable = false,
            )
        }
        fetchFirstPage(lat, lng, radiusKm)
    }

    /**
     * The host has started acquiring a location fix (permission prompt showing, or the
     * GPS/network fix itself in flight). Cleared once that attempt resolves, via
     * [loadNearby], [onPermissionDenied] or [onLocationUnavailable].
     */
    fun onLocating() = status.update { it.copy(isLocating = true) }

    /**
     * Pull-to-refresh: re-query the last known coordinates, no new GPS fix. Re-entrant
     * calls while a load or refresh is already in flight are a no-op. The current posts
     * stay on screen until the new page lands (stale-while-revalidate) — the list is
     * replaced atomically on success, never cleared upfront, so a failed refresh leaves
     * the previous page visible instead of an empty state.
     */
    fun refresh() {
        val lat = lastLat ?: return
        val lng = lastLng ?: return
        if (status.value.isLoading || status.value.isRefreshing) return
        status.update { it.copy(isRefreshing = true, error = null) }
        fetchFirstPage(lat, lng, DEFAULT_RADIUS_KM, replace = true)
    }

    /**
     * Infinite scroll: once the given post is within [LOAD_MORE_THRESHOLD] of the tail
     * and the pure state says a page can still be fetched, load the next page for the
     * same coordinates. A failed page is silent (the next scroll re-triggers).
     */
    fun loadMoreIfNeeded(postId: String) {
        val lat = lastLat ?: return
        val lng = lastLng ?: return
        val current = _state.value
        val index = current.posts.indexOfFirst { it.id == postId }
        if (index < 0 || index < current.posts.size - LOAD_MORE_THRESHOLD) return
        val list = listState.value
        if (!list.canLoadMore || status.value.isLoadingMore) return

        status.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                when (val result = postRepository.getNearbyPage(lat, lng, DEFAULT_RADIUS_KM, cursor = list.cursor)) {
                    is NetworkResult.Success -> listState.update { it.foldPage(result.data) }
                    is NetworkResult.Failure -> Unit
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Silent: the next scroll re-triggers the fetch.
            } finally {
                status.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun onPermissionDenied() = status.update { it.copy(permissionDenied = true, isLoading = false, isLocating = false) }

    fun onLocationUnavailable() = status.update { it.copy(locationUnavailable = true, isLoading = false, isLocating = false) }

    private fun fetchFirstPage(lat: Double, lng: Double, radiusKm: Double, replace: Boolean = false) {
        viewModelScope.launch {
            try {
                when (val result = postRepository.getNearbyPage(lat, lng, radiusKm, cursor = null)) {
                    is NetworkResult.Success -> {
                        listState.update { current ->
                            if (replace) NearbyListState().foldPage(result.data) else current.foldPage(result.data)
                        }
                        status.update { it.copy(isLoading = false, isRefreshing = false) }
                    }
                    is NetworkResult.Failure -> status.update {
                        it.copy(isLoading = false, isRefreshing = false, error = result.error.message)
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(isLoading = false, isRefreshing = false, error = e.message) }
            }
        }
    }

    private fun project(list: NearbyListState, user: MeeshyUser?, st: NearbyStatus): NearbyUiState {
        val prefs: LanguageResolver.ContentLanguagePreferences = user ?: EmptyContentPreferences
        val projected = list.posts.map { FeedPostBuilder.build(it, prefs, config.socketUrl) }
        val showSkeleton = st.isLoading && !list.hasLoaded && projected.isEmpty() && st.error == null
        return NearbyUiState(
            posts = projected,
            isLoading = st.isLoading,
            isRefreshing = st.isRefreshing,
            isLoadingMore = st.isLoadingMore,
            isLocating = st.isLocating,
            showSkeleton = showSkeleton,
            hasMore = list.hasMore,
            hasLocation = lastLat != null,
            permissionDenied = st.permissionDenied,
            locationUnavailable = st.locationUnavailable,
            errorMessage = st.error,
        )
    }

    private companion object {
        const val LOAD_MORE_THRESHOLD = 5
        const val DEFAULT_RADIUS_KM = 25.0
    }
}

private data class NearbyStatus(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isLocating: Boolean = false,
    val permissionDenied: Boolean = false,
    val locationUnavailable: Boolean = false,
    val error: String? = null,
)
