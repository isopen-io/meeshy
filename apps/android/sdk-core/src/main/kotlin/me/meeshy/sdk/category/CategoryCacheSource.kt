package me.meeshy.sdk.category

import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.expansionById
import me.meeshy.sdk.model.toOptions
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.net.apiCall

/** Thrown when a category revalidation fails; carries the API error message. */
internal class CategorySyncException(message: String) : Exception(message)

/**
 * Snapshot-store-backed [SwrCacheSource] for the user's category catalogue
 * (ARCHITECTURE.md §4). [observe]/[lastSyncedAt] read the durable snapshot;
 * [revalidate] pulls the full catalogue from the gateway, narrows the wire rows to
 * [CategoryOption]s and persists them with a fresh sync stamp.
 */
internal class CategoryCacheSource(
    private val store: CategorySnapshotStore,
    private val preferencesApi: PreferencesApi,
    private val clock: CacheClock,
    private val expansion: CategoryExpansionStore? = null,
) : SwrCacheSource<List<CategoryOption>> {

    override fun observe(): Flow<List<CategoryOption>?> = store.observe()

    override fun lastSyncedAt(): Flow<Long?> = store.lastSyncedAt()

    override suspend fun revalidate() {
        when (val result = apiCall { preferencesApi.getCategories(limit = PAGE_SIZE) }) {
            is NetworkResult.Success -> {
                store.save(result.data.toOptions(), clock.nowMillis())
                expansion?.replaceAll(result.data.expansionById())
            }
            is NetworkResult.Failure -> throw CategorySyncException(result.error.message)
        }
    }

    private companion object {
        // The device caches the whole catalogue, so one wide page covers any realistic user —
        // and the widest the gateway accepts: `GET /me/preferences/categories` declares
        // `limit` with `maximum: 100` and answers 400 above it, which left every category
        // section of the list empty.
        const val PAGE_SIZE = 100
    }
}
