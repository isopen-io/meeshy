package me.meeshy.sdk.category

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.net.api.PreferencesApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Cache-first source of the user's conversation-category catalogue (parity iOS
 * `PreferenceService.getCategories` + `UserCategoryStore.hydrate`): the persisted
 * snapshot is served immediately and revalidated from the gateway in the background.
 *
 * The stream flattens the SWR verdict down to the plain catalogue list the
 * conversation-list section splitter consumes ([ConversationSections] via
 * `ConversationListUiState.categories`) — a cold or syncing-with-no-cache state maps
 * to the empty catalogue, which keeps the list on its pinned/all split until real
 * categories arrive (a safe default, never a dead end).
 */
@Singleton
class CategoryRepository @Inject constructor(
    private val preferencesApi: PreferencesApi,
    private val store: CategorySnapshotStore,
    private val clock: CacheClock = SystemCacheClock,
) {
    private val cacheSource = CategoryCacheSource(
        store = store,
        preferencesApi = preferencesApi,
        clock = clock,
    )

    /**
     * Cache-first catalogue stream. [onSyncError] surfaces a failed background
     * revalidation; the cached snapshot (if any) keeps flowing regardless.
     */
    fun categoriesStream(
        policy: CachePolicy = CachePolicy.Default,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<List<CategoryOption>> =
        cacheFirstFlow(policy, cacheSource, clock = clock, onRevalidateError = onSyncError)
            .map { it.valueOrNull ?: emptyList() }

    /** Explicit refresh (pull-to-refresh / retry). Throws on failure. */
    suspend fun refresh() {
        cacheSource.revalidate()
    }
}
