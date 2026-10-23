package me.meeshy.sdk.call

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.CallHistoryDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.CallHistoryEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CallHistoryApi
import me.meeshy.sdk.net.pagedApiCall
import me.meeshy.sdk.util.isoToEpochMillis

/** Thrown when a call-history revalidation fails; carries the API error message. */
internal class CallHistorySyncException(message: String) : Exception(message)

/**
 * Room-backed [SwrCacheSource] for the call journal (ARCHITECTURE.md §4).
 * Mirrors [me.meeshy.sdk.story.StoryCacheSource]: each [CallRecord] is cached as
 * a serialized payload, `sync_meta` records freshness so an unchanged journal is
 * not rewritten on every revalidation, and a synced-but-empty journal (a real
 * empty list) is distinguished from a cold cache (`null`).
 */
internal class CallHistoryCacheSource(
    private val database: MeeshyDatabase,
    private val callHistoryDao: CallHistoryDao,
    private val syncMetaDao: SyncMetaDao,
    private val callHistoryApi: CallHistoryApi,
    private val clock: CacheClock,
) : SwrCacheSource<List<CallRecord>> {

    override fun observe(): Flow<List<CallRecord>?> =
        combine(
            callHistoryDao.observeAll(),
            syncMetaDao.observe(RESOURCE_KEY),
        ) { rows, syncedAt ->
            if (rows.isEmpty() && syncedAt == null) {
                null
            } else {
                rows.map { MeeshyApi.json.decodeFromString<CallRecord>(it.payload) }
            }
        }

    override fun lastSyncedAt(): Flow<Long?> = syncMetaDao.observe(RESOURCE_KEY)

    /**
     * One request: the first page of [HISTORY_PAGE_SIZE] rows, merged with the cached
     * tail (iso-iOS; before, up to 30 pages were pulled at every revalidation).
     *
     * Rows OLDER than the fresh page are the cached tail and are kept (within the
     * server's 90-day window, capped at [MAX_ROWS]). Rows inside the fresh window that
     * the server no longer lists are deleted. The window is proven only by the page:
     * when `hasMore` it starts at the page's oldest call; when the server says the
     * sweep is complete it spans everything; an envelope with NO `pagination` block is
     * UNKNOWN completeness (#5190) — what was seen is upserted, nothing is pruned.
     */
    override suspend fun revalidate() {
        when (val result = pagedApiCall { callHistoryApi.history(null, HISTORY_PAGE_SIZE, FILTER_ALL, null, null) }) {
            is NetworkResult.Success -> persist(
                records = result.data.data,
                completeness = result.data.pagination?.let { if (it.hasMore) Window.PARTIAL else Window.COMPLETE }
                    ?: Window.UNKNOWN,
            )
            is NetworkResult.Failure -> throw CallHistorySyncException(result.error.message)
        }
    }

    /** Ids erased locally and not yet confirmed gone from the server: a revalidation must not resurrect them. */
    private val suppressedIds: MutableSet<String> = ConcurrentHashMap.newKeySet()

    internal fun suppress(callIds: Collection<String>) {
        suppressedIds.addAll(callIds)
    }

    internal fun unsuppress(callIds: Collection<String>) {
        suppressedIds.removeAll(callIds.toSet())
    }

    internal enum class Window { PARTIAL, COMPLETE, UNKNOWN }

    private suspend fun persist(records: List<CallRecord>, completeness: Window) {
        val now = clock.nowMillis()
        val fresh = records.filterNot { it.callId in suppressedIds }
        val rows = fresh.map { record ->
            CallHistoryEntity(
                callId = record.callId,
                payload = MeeshyApi.json.encodeToString(record),
                startedAt = isoToEpochMillis(record.startedAt),
                cachedAt = now,
            )
        }
        database.withTransaction {
            callHistoryDao.upsertAll(rows)
            val windowStart = when (completeness) {
                Window.COMPLETE -> Long.MIN_VALUE
                Window.PARTIAL -> rows.minOfOrNull { it.startedAt }?.let { it + 1 }
                Window.UNKNOWN -> null
            }
            if (windowStart != null) {
                val keep = records.mapTo(HashSet()) { it.callId }
                pruneIds(callHistoryDao.idsSince(windowStart).filterNot { it in keep })
            }
            callHistoryDao.deleteOlderThan(now - WINDOW_MILLIS)
            pruneIds(callHistoryDao.idsBeyond(MAX_ROWS))
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
        }
    }

    private suspend fun pruneIds(ids: List<String>) {
        ids.chunked(DELETE_CHUNK_SIZE).forEach { callHistoryDao.deleteByIds(it) }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "call_history"
        private const val HISTORY_PAGE_SIZE = 50
        private const val FILTER_ALL = "all"

        /** The server's sliding window: older cached rows have left the journal. */
        const val WINDOW_MILLIS: Long = 90L * 24 * 60 * 60 * 1000

        /** Cap of the cached journal (the 30 pages x 50 the old sweep could reach). */
        const val MAX_ROWS: Int = 1_500

        /**
         * Bound-variable budget per [CallHistoryDao.deleteByIds] call — under
         * the 999-per-statement floor `minSdk = 26` (API 26-29) enforces.
         */
        private const val DELETE_CHUNK_SIZE = 900
    }
}
