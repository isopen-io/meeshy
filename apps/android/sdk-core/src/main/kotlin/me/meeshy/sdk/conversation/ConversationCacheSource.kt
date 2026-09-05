package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.pagedApiCall
import me.meeshy.sdk.util.isoToEpochMillis

/** Thrown when a conversation revalidation fails; carries the API error message. */
internal class ConversationSyncException(message: String) : Exception(message)

/**
 * Room-backed [SwrCacheSource] for the conversation list (ARCHITECTURE.md §4).
 * The list is cached as serialized payloads; `sync_meta` records freshness so an
 * unchanged list is not rewritten on every revalidation.
 */
internal class ConversationCacheSource(
    private val database: MeeshyDatabase,
    private val conversationDao: ConversationDao,
    private val syncMetaDao: SyncMetaDao,
    private val conversationApi: ConversationApi,
    private val clock: CacheClock,
) : SwrCacheSource<List<ApiConversation>> {

    override fun observe(): Flow<List<ApiConversation>?> =
        combine(
            conversationDao.observeAll(),
            syncMetaDao.observe(RESOURCE_KEY),
        ) { rows, syncedAt ->
            // Cold cache (never synced) is null → CacheResult.Empty; a synced-but-
            // empty list is a real, non-null empty list → Fresh/Stale.
            if (rows.isEmpty() && syncedAt == null) {
                null
            } else {
                rows.map { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }
            }
        }

    override fun lastSyncedAt(): Flow<Long?> = syncMetaDao.observe(RESOURCE_KEY)

    /**
     * Pages through the account's conversations up to [MAX_PAGES]
     * (`MAX_PAGES * CONVERSATIONS_PAGE_SIZE` = 10 000, the same hard ceiling as
     * iOS's full-sync — `ConversationSyncEngine+Chargement.swift` — though
     * Android walks more, smaller pages to get there: `validatePagination`
     * (gateway) caps `limit` at 100). [persist] only prunes rows absent from the
     * fetched set when the sweep is PROVEN complete — the server said
     * `hasMore = false` — never merely because the page budget ran out: a
     * partial sweep may upsert what it saw, but must never be trusted to know
     * what to delete.
     *
     * #5186 — the previous implementation called `conversationApi.list()` with
     * NO pagination, i.e. the server's own default page (≤ 30 rows), then
     * `deleteNotIn`'d everything outside that single page. Any account with
     * more than 30 active conversations lost the rest on every revalidation
     * (the 5-minute cache cycle, or a socket-triggered refresh).
     *
     * `GET /conversations`'s envelope carries `pagination.hasMore` but no
     * cursor (unlike [me.meeshy.sdk.story.StoryCacheSource]'s
     * `pagination.nextCursor`), so completeness is tracked by advancing
     * `offset` by however many rows the page actually returned, not by the
     * requested page size.
     *
     * A page whose envelope omits `pagination` entirely (absent, not
     * `hasMore = false`) is UNKNOWN completeness, not proven completeness —
     * treating `pagination?.hasMore ?: false` as "no more pages" is a failure
     * direction backwards for a DELETE: it turns a server that forgot to send
     * the block into data loss instead of a merely-stale cache. What was seen
     * is still upserted (never discarded), but the sweep stops right there
     * (never proven complete, and pointless to keep paging blind) and
     * [persist] is called with `prune = false`.
     */
    override suspend fun revalidate() {
        val collected = mutableListOf<ApiConversation>()
        var offset = 0
        var isComplete = false

        for (page in 0 until MAX_PAGES) {
            when (
                val result = pagedApiCall {
                    conversationApi.list(offset = offset, limit = CONVERSATIONS_PAGE_SIZE)
                }
            ) {
                is NetworkResult.Success -> {
                    val rows = result.data.data
                    collected += rows
                    val pagination = result.data.pagination
                        ?: break // Unknown completeness — never infer "done" from a missing block.
                    if (!pagination.hasMore) {
                        isComplete = true
                        break
                    }
                    offset += rows.size
                }
                is NetworkResult.Failure -> throw ConversationSyncException(result.error.message)
            }
        }

        persist(collected, prune = isComplete)
    }

    /**
     * Deletes stale rows by computing the delete-set in Kotlin — `localIds -
     * keptIds` — rather than a single `DELETE ... WHERE id NOT IN (:keptIds)`.
     *
     * SQLite caps bound variables per statement at `SQLITE_MAX_VARIABLE_NUMBER`
     * — 999 on Android API 26-29 (raised on later releases, but `minSdk = 26`
     * makes 999 the floor this app must hold under). [MAX_PAGES] ×
     * [CONVERSATIONS_PAGE_SIZE] deliberately allows sweeping up to 10 000
     * conversations — i.e. the very `keptIds` list a `NOT IN` clause would bind
     * one variable per id for — so the fix this method exists to prevent
     * ("too many SQL variables" thrown mid-transaction, ON DEVICE, for exactly
     * the large accounts #5186 protects) is not a corner case, it is the
     * common case this class was built to survive. A `NOT IN` cannot be
     * chunked directly either: deleting "not in chunk 1" would also delete
     * every row that only appears in chunk 2.
     *
     * Deletion itself still goes through [ConversationDao.deleteByIds], which
     * DOES bind one variable per id — so the ids to delete are chunked to
     * [DELETE_CHUNK_SIZE] (900, comfortably under the 999 floor) before each
     * call. Robolectric/JVM SQLite does not enforce
     * `SQLITE_MAX_VARIABLE_NUMBER`, so no unit test can reproduce the device
     * crash directly; what the tests below prove is the delete-set's
     * CORRECTNESS (kept rows survive, stale rows vanish) at a scale well past
     * the 999 threshold — the chunking is what keeps that correct behaviour
     * from crashing when SQLite actually enforces the limit.
     */
    private suspend fun pruneMissing(keptIds: List<String>) {
        val kept = keptIds.toHashSet()
        val toDelete = conversationDao.allIds().filterNot { it in kept }
        toDelete.chunked(DELETE_CHUNK_SIZE).forEach { chunk ->
            conversationDao.deleteByIds(chunk)
        }
    }

    private suspend fun persist(conversations: List<ApiConversation>, prune: Boolean) {
        val now = clock.nowMillis()
        val rows = conversations.map { conversation ->
            ConversationEntity(
                id = conversation.id,
                payload = MeeshyApi.json.encodeToString(conversation),
                updatedAt = isoToEpochMillis(
                    conversation.updatedAt
                        ?: conversation.lastMessage?.createdAt
                        ?: conversation.createdAt,
                ),
                cachedAt = now,
            )
        }
        database.withTransaction {
            conversationDao.upsertAll(rows)
            if (prune) pruneMissing(rows.map { it.id })
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
        }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "conversations"
        private const val CONVERSATIONS_PAGE_SIZE = 100
        private const val MAX_PAGES = 100

        /**
         * Bound-variable budget per [ConversationDao.deleteByIds] call — under
         * the 999-per-statement floor `minSdk = 26` (API 26-29) enforces.
         */
        private const val DELETE_CHUNK_SIZE = 900
    }
}
