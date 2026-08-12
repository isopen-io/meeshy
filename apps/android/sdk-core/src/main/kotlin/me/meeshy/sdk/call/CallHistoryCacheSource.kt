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
import me.meeshy.sdk.net.apiCall
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

    override suspend fun revalidate() {
        when (val result = apiCall { callHistoryApi.history(null, HISTORY_PAGE_SIZE, null) }) {
            is NetworkResult.Success -> persist(result.data)
            is NetworkResult.Failure -> throw CallHistorySyncException(result.error.message)
        }
    }

    private suspend fun persist(records: List<CallRecord>) {
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
            callHistoryDao.deleteNotIn(rows.map { it.callId })
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
        }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "call_history"
        private const val HISTORY_PAGE_SIZE = 30
    }
}
