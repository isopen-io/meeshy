package me.meeshy.sdk.call

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
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
     * Pages through `GET /calls/history` — cursor-paginated over a 3-month
     * server-side sliding window (`CallService.listHistory`,
     * `services/gateway/src/services/CallService.ts`) — up to [MAX_PAGES]
     * (`× [HISTORY_PAGE_SIZE]` = 1 500 calls; the gateway caps `limit` at 50).
     *
     * #5190 — the previous implementation called `callHistoryApi.history(null,
     * HISTORY_PAGE_SIZE, null)` for a SINGLE page (≤ 30 rows, the server's own
     * default), then `deleteNotIn`'d everything outside it — any account with
     * more terminal calls than that in the 3-month window lost the rest on
     * every revalidation (the cache-policy tick or an explicit pull-to-refresh).
     * Same patron already established for
     * [me.meeshy.sdk.conversation.ConversationCacheSource] (#5186 and its own
     * hardening, #5186 review thread): [persist] only prunes rows absent from
     * the fetched set when the sweep is PROVEN exhaustive — the server said
     * `hasMore = false` — never merely because the page budget ran out. An
     * envelope with NO `pagination` block at all is UNKNOWN completeness, not
     * proven completeness: what was seen is still upserted, but the sweep
     * stops right there and [persist] runs with `prune = false` — reading a
     * missing block as "done" is the wrong failure direction for a DELETE.
     *
     * The 3-month window bounds the total naturally for the overwhelming
     * majority of accounts, but does not CAP it — a heavy caller can still
     * clear SQLite's 999-bound-variable ceiling inside three months, which is
     * exactly what [pruneMissing]'s chunked delete-set exists to survive (note
     * de revue on #5186's own review thread, 2026-09-05).
     */
    override suspend fun revalidate() {
        val collected = mutableListOf<CallRecord>()
        var cursor: String? = null
        var isComplete = false

        for (page in 0 until MAX_PAGES) {
            when (val result = pagedApiCall { callHistoryApi.history(cursor, HISTORY_PAGE_SIZE, null) }) {
                is NetworkResult.Success -> {
                    collected += result.data.data
                    val pagination = result.data.pagination
                        ?: break // Unknown completeness — never infer "done" from a missing block.
                    if (!pagination.hasMore) {
                        isComplete = true
                        break
                    }
                    cursor = pagination.nextCursor ?: break
                }
                is NetworkResult.Failure -> throw CallHistorySyncException(result.error.message)
            }
        }

        persist(collected, prune = isComplete)
    }

    /**
     * Deletes stale rows by computing the delete-set in Kotlin — `localIds -
     * keptIds` — rather than a single `DELETE ... WHERE callId NOT IN
     * (:keptIds)`. SQLite caps bound variables per statement at
     * `SQLITE_MAX_VARIABLE_NUMBER` — 999 on Android API 26-29, the floor
     * `minSdk = 26` makes this app hold under. A `NOT IN` cannot be chunked
     * directly either: deleting "not in chunk 1" would also delete every row
     * that only appears in chunk 2. Deletion goes through
     * [CallHistoryDao.deleteByIds], which DOES bind one variable per id, so the
     * ids to delete are chunked to [DELETE_CHUNK_SIZE] (900, comfortably under
     * the 999 floor) before each call. Mirrors
     * `ConversationCacheSource.pruneMissing` exactly.
     */
    private suspend fun pruneMissing(keptIds: List<String>) {
        val kept = keptIds.toHashSet()
        val toDelete = callHistoryDao.allIds().filterNot { it in kept }
        toDelete.chunked(DELETE_CHUNK_SIZE).forEach { chunk ->
            callHistoryDao.deleteByIds(chunk)
        }
    }

    private suspend fun persist(records: List<CallRecord>, prune: Boolean) {
        val now = clock.nowMillis()
        val rows = records.map { record ->
            CallHistoryEntity(
                callId = record.callId,
                payload = MeeshyApi.json.encodeToString(record),
                startedAt = isoToEpochMillis(record.startedAt),
                cachedAt = now,
            )
        }
        database.withTransaction {
            callHistoryDao.upsertAll(rows)
            if (prune) pruneMissing(rows.map { it.callId })
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
        }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "call_history"
        private const val HISTORY_PAGE_SIZE = 50
        private const val MAX_PAGES = 30

        /**
         * Bound-variable budget per [CallHistoryDao.deleteByIds] call — under
         * the 999-per-statement floor `minSdk = 26` (API 26-29) enforces.
         */
        private const val DELETE_CHUNK_SIZE = 900
    }
}
