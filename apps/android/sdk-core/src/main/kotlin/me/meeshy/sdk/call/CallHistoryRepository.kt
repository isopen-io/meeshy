package me.meeshy.sdk.call

import androidx.room.withTransaction
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.CallHistoryDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.CallHistoryEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.model.call.CallJournalFilter
import me.meeshy.sdk.model.call.CallJournalQuery
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CallHistoryApi
import me.meeshy.sdk.net.apiCall
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
 * immediately and revalidates in the background (ONE request, merged with the
 * cached tail); [journalStream] answers a non-default query (Manqués, a media
 * type, a typed name) from a bounded memory cache, derived offline from the
 * default journal; [fetchPage] is the raw cursor-paginated fetch; [hide] and
 * [clearAll] erase for the reader alone, optimistically.
 */
@Singleton
class CallHistoryRepository internal constructor(
    private val callHistoryApi: CallHistoryApi,
    private val database: MeeshyDatabase,
    private val callHistoryDao: CallHistoryDao,
    syncMetaDao: SyncMetaDao,
    private val clock: CacheClock,
) {
    @Inject
    constructor(
        callHistoryApi: CallHistoryApi,
        database: MeeshyDatabase,
        callHistoryDao: CallHistoryDao,
        syncMetaDao: SyncMetaDao,
    ) : this(callHistoryApi, database, callHistoryDao, syncMetaDao, SystemCacheClock)

    private val cacheSource = CallHistoryCacheSource(
        database = database,
        callHistoryDao = callHistoryDao,
        syncMetaDao = syncMetaDao,
        callHistoryApi = callHistoryApi,
        clock = clock,
    )

    private val memory = CallJournalMemoryCache()

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
        cacheFirstFlow(policy, cacheSource, clock = clock, onRevalidateError = onSyncError)

    /**
     * The journal for [query]. The default query is the Room-backed [historyStream];
     * any other is answered at once from memory (a search already made) or derived
     * from the default journal (never an empty screen while typing, even offline),
     * then settled by ONE gateway request narrowed server-side over the whole window.
     */
    fun journalStream(
        query: CallJournalQuery,
        fallbackName: String,
        policy: CachePolicy = CachePolicy.CallHistory,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<CallRecord>>> {
        if (query.isDefault) return historyStream(policy, onSyncError)
        return flow {
            val remembered = memory.get(query.cacheKey)
            val derived = cacheSource.observe().first()?.let { query.apply(it, fallbackName) }
            when {
                remembered != null ->
                    emit(CacheResult.Stale(remembered.records, clock.nowMillis() - remembered.storedAtMillis))
                derived != null -> emit(CacheResult.Stale(derived, 0L))
                else -> emit(CacheResult.Empty)
            }
            when (val page = fetchJournalPage(query = query, limit = HEAD_PAGE_SIZE)) {
                is NetworkResult.Success -> {
                    memory.put(query.cacheKey, CallJournalMemoryEntry(page.data.records, clock.nowMillis()))
                    emit(CacheResult.Fresh(page.data.records, 0L))
                }
                is NetworkResult.Failure -> onSyncError(CallHistorySyncException(page.error.message))
            }
        }
    }

    /** Explicit refresh (pull-to-refresh / retry). Throws on failure. */
    suspend fun refresh() {
        cacheSource.revalidate()
    }

    /**
     * Erases one line for the reader alone. Optimistic: the line leaves the cache at
     * once and returns to its original place (the order is by `startedAt`) if the
     * gateway refuses. A 404 (already gone from this journal) counts as applied.
     */
    suspend fun hide(callId: String): NetworkResult<Unit> =
        erase(listOf(callId)) {
            when (val result = apiCall { callHistoryApi.hide(callId) }) {
                is NetworkResult.Success -> NetworkResult.Success(Unit)
                is NetworkResult.Failure ->
                    if (result.error.httpStatus == HTTP_NOT_FOUND) NetworkResult.Success(Unit) else result
            }
        }

    /** Clears the reader's whole journal (the others keep theirs); rolled back on failure. */
    suspend fun clearAll(): NetworkResult<Int> {
        var cleared = 0
        val ids = callHistoryDao.all().map { it.callId }
        val outcome = erase(ids) {
            when (val result = apiCall { callHistoryApi.clearAll() }) {
                is NetworkResult.Success -> {
                    cleared = result.data.cleared
                    NetworkResult.Success(Unit)
                }
                is NetworkResult.Failure -> result
            }
        }
        return when (outcome) {
            is NetworkResult.Success -> NetworkResult.Success(cleared)
            is NetworkResult.Failure -> outcome
        }
    }

    private suspend fun erase(
        callIds: List<String>,
        remote: suspend () -> NetworkResult<Unit>,
    ): NetworkResult<Unit> {
        val gone = callIds.toSet()
        val snapshot = database.withTransaction {
            val rows = callHistoryDao.all().filter { it.callId in gone }
            rows.map { it.callId }.chunked(DELETE_CHUNK_SIZE).forEach { callHistoryDao.deleteByIds(it) }
            rows
        }
        val memorySnapshot = memory.snapshot()
        cacheSource.suppress(callIds)
        memory.removeCalls(gone)
        val result = try {
            remote()
        } catch (e: CancellationException) {
            withContext(NonCancellable) { rollback(callIds, snapshot, memorySnapshot) }
            throw e
        }
        if (result is NetworkResult.Failure) rollback(callIds, snapshot, memorySnapshot)
        return result
    }

    private suspend fun rollback(
        callIds: List<String>,
        rows: List<CallHistoryEntity>,
        memorySnapshot: Map<String, CallJournalMemoryEntry>,
    ) {
        cacheSource.unsuppress(callIds)
        callHistoryDao.upsertAll(rows)
        memory.restore(memorySnapshot)
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
    ): NetworkResult<CallHistoryPage> =
        fetchJournalPage(
            query = CallJournalQuery(filter = if (missedOnly) CallJournalFilter.MISSED else CallJournalFilter.ALL),
            cursor = cursor,
            limit = limit,
        )

    /** The same page narrowed by [query] (direction, media type, typed name) on the gateway. */
    suspend fun fetchJournalPage(
        query: CallJournalQuery,
        cursor: String? = null,
        limit: Int = DEFAULT_PAGE_SIZE,
    ): NetworkResult<CallHistoryPage> {
        val call = rawApiCall {
            callHistoryApi.history(cursor, limit, query.wireFilter, query.wireType, query.wireSearch)
        }
        return when (val result = call) {
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
        const val HEAD_PAGE_SIZE = 50
        const val HTTP_NOT_FOUND = 404

        /** Under the 999 bound variables SQLite allows per statement on API 26-29. */
        const val DELETE_CHUNK_SIZE = 900
    }
}
