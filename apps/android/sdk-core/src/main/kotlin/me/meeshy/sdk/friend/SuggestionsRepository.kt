package me.meeshy.sdk.friend

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject
import javax.inject.Singleton

/** Thrown when a suggestions revalidation fails; carries the API error message. */
internal class SuggestionsSyncException(message: String) : Exception(message)

/**
 * In-memory [SwrCacheSource] for the empty-query discover suggestions. The
 * gateway returns its "discover" list (recent-active / mutual friends) for an
 * empty search query — exactly what iOS `searchUsers(query: "")` hits — and the
 * last successful fetch is held in memory so a return to the Discover tab within
 * a session paints instantly with no cold spinner.
 *
 * A revalidation failure leaves the last good data in place (it throws so
 * [cacheFirstFlow]'s `onRevalidateError` surfaces the message); a cold failure
 * keeps the cache `null` so the UI can retry.
 *
 * (A persistent Room cache for cross-launch cold-start paint — parity with iOS
 * `CacheCoordinator.userSearch` — is a tracked follow-up, matching the current
 * friends-list precedent, which is also in-memory-reconciled today.)
 */
internal class InMemorySuggestionsSource(
    private val userRepository: UserRepository,
    private val clock: CacheClock,
) : SwrCacheSource<List<UserSearchResult>> {

    private val data = MutableStateFlow<List<UserSearchResult>?>(null)
    private val syncedAt = MutableStateFlow<Long?>(null)

    override fun observe(): Flow<List<UserSearchResult>?> = data.asStateFlow()

    override fun lastSyncedAt(): Flow<Long?> = syncedAt.asStateFlow()

    override suspend fun revalidate() {
        when (val result = userRepository.searchUsers(SUGGESTIONS_QUERY, SUGGESTIONS_LIMIT, 0)) {
            is NetworkResult.Success -> {
                data.value = result.data
                syncedAt.value = clock.nowMillis()
            }
            is NetworkResult.Failure -> throw SuggestionsSyncException(result.error.message)
        }
    }

    internal companion object {
        /** Empty query — the gateway returns the discover suggestions list. */
        const val SUGGESTIONS_QUERY: String = ""
        const val SUGGESTIONS_LIMIT: Int = 20
    }
}

/**
 * The discover-suggestions surface — port of the iOS
 * `DiscoverViewModel.loadSuggestions` cache-first path. [suggestionsStream]
 * serves the last in-memory suggestions immediately (no cold spinner on a return
 * visit) and revalidates against the network in the background.
 */
@Singleton
class SuggestionsRepository @Inject constructor(
    userRepository: UserRepository,
) {
    private val source = InMemorySuggestionsSource(userRepository, SystemCacheClock)

    fun suggestionsStream(
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<UserSearchResult>>> =
        cacheFirstFlow(CachePolicy.Suggestions, source, onRevalidateError = onSyncError)
}
