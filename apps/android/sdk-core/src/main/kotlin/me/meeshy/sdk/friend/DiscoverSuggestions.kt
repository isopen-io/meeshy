package me.meeshy.sdk.friend

import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.net.api.UserSearchResult

/**
 * The users a suggestions surface should render plus whether it is still
 * cold-loading (nothing cached yet). Immutable — the pure projection's only
 * output.
 */
data class SuggestionsSnapshot(
    val users: List<UserSearchResult>,
    val isLoading: Boolean,
)

/**
 * Pure projection of the cache-first [CacheResult] into the empty-query
 * "discover people" suggestions surface. Port of the iOS
 * `DiscoverViewModel.loadSuggestions` `loadState`/`searchResults` handling:
 *
 * - A cold cache ([CacheResult.Empty], or [CacheResult.Syncing] with no data
 *   yet) shows a skeleton — the ONLY loading state (Instant-App: skeleton only
 *   on cold empty).
 * - Any cached data — fresh, stale, or expired-and-revalidating — paints
 *   immediately, never a spinner.
 * - A revalidated-but-empty list is content (an empty suggestions surface),
 *   not loading: the network genuinely returned no one to suggest.
 *
 * Total over the sealed [CacheResult] so the surface's "skeleton vs paint"
 * decision is unit-tested once and never re-derived in the ViewModel or the
 * Composable.
 */
object DiscoverSuggestions {
    fun snapshot(result: CacheResult<List<UserSearchResult>>): SuggestionsSnapshot =
        when (result) {
            CacheResult.Empty -> SuggestionsSnapshot(users = emptyList(), isLoading = true)
            is CacheResult.Syncing -> {
                val data = result.value
                if (data == null) {
                    SuggestionsSnapshot(users = emptyList(), isLoading = true)
                } else {
                    SuggestionsSnapshot(users = data, isLoading = false)
                }
            }
            is CacheResult.Fresh -> SuggestionsSnapshot(users = result.value, isLoading = false)
            is CacheResult.Stale -> SuggestionsSnapshot(users = result.value, isLoading = false)
        }
}
