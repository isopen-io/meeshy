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
                    val hasMore = result.data.pagination?.hasMore ?: false
                    if (!hasMore) {
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
            if (prune) conversationDao.deleteNotIn(rows.map { it.id })
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
        }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "conversations"
        private const val CONVERSATIONS_PAGE_SIZE = 100
        private const val MAX_PAGES = 100
    }
}
