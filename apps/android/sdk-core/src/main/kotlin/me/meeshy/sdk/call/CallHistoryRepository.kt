package me.meeshy.sdk.call

import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.CallHistoryDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CallHistoryApi
import me.meeshy.sdk.net.rawApiCall
import javax.inject.Inject
import javax.inject.Singleton

/** One cursor-paginated page of the call journal — the raw fetch's result. */
data class CallHistoryPage(
    val records: List<CallRecord>,
    val nextCursor: String?,
    val hasMore: Boolean,
)

/**
 * The call journal — port of the iOS `CallHistoryService` REST + cache layer.
 *
 * Cache-first (ARCHITECTURE.md §4): [historyStream] paints the cached journal
 * immediately and revalidates in the background; [fetchPage] is the raw
 * cursor-paginated fetch the list UI drives for older pages.
 */
@Singleton
class CallHistoryRepository @Inject constructor(
    private val callHistoryApi: CallHistoryApi,
    database: MeeshyDatabase,
    callHistoryDao: CallHistoryDao,
    syncMetaDao: SyncMetaDao,
) {
    private val cacheSource = CallHistoryCacheSource(
        database = database,
        callHistoryDao = callHistoryDao,
        syncMetaDao = syncMetaDao,
        callHistoryApi = callHistoryApi,
        clock = SystemCacheClock,
    )

    /**
     * Cache-first call-journal stream: the cached list is served immediately (no
     * cold spinner when rows exist) and revalidated in the background.
     * [onSyncError] surfaces a failed background revalidation so the UI can leave
     * its cold skeleton.
     */
    fun historyStream(
        policy: CachePolicy = CachePolicy.CallHistory,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<CallRecord>>> =
        cacheFirstFlow(policy, cacheSource, onRevalidateError = onSyncError)

    /** Explicit refresh (pull-to-refresh / retry). Throws on failure. */
    suspend fun refresh() {
        cacheSource.revalidate()
    }

    /**
     * A single cursor-paginated page — the building block the list UI drives for
     * paging beyond the cached first page. [missedOnly] mirrors the gateway
     * `filter=missed` query; [cursor] is the previous page's [CallHistoryPage.nextCursor].
     */
    suspend fun fetchPage(
        cursor: String? = null,
        limit: Int = DEFAULT_PAGE_SIZE,
        missedOnly: Boolean = false,
    ): NetworkResult<CallHistoryPage> {
        val filter = if (missedOnly) FILTER_MISSED else FILTER_ALL
        return when (val result = rawApiCall { callHistoryApi.history(cursor, limit, filter) }) {
            is NetworkResult.Success -> {
                val envelope = result.data
                val data = envelope.data
                if (envelope.success && data != null) {
                    NetworkResult.Success(
                        CallHistoryPage(
                            records = data,
                            nextCursor = envelope.pagination?.nextCursor,
                            hasMore = envelope.pagination?.hasMore ?: false,
                        ),
                    )
                } else {
                    NetworkResult.Failure(
                        ApiError(
                            message = envelope.error ?: envelope.message ?: "Unknown error",
                            code = envelope.code,
                        ),
                    )
                }
            }
            is NetworkResult.Failure -> result
        }
    }

    private companion object {
        const val DEFAULT_PAGE_SIZE = 30
        const val FILTER_ALL = "all"
        const val FILTER_MISSED = "missed"
    }
}
