package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import java.time.Instant
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
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.isoToEpochMillisOrNull
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
     * The outcome of one paginated sweep — the rows collected, and whether the
     * sweep is PROVEN exhaustive (walked every page to `hasMore = false`), never
     * merely "the page budget ran out" or "we stopped because the shape was
     * untrustworthy". Shared by the full sweep and the delta sweep (#5187):
     * both page through [MAX_PAGES] × [CONVERSATIONS_PAGE_SIZE] the same way,
     * differing only in whether `updatedSince` is set — [ConversationApi.list]'s
     * contract (`services/gateway/src/routes/conversations/core-list.ts:251-264`).
     */
    private class SweepOutcome(val conversations: List<ApiConversation>, val isComplete: Boolean)

    /**
     * Pages through `GET /conversations` up to [MAX_PAGES] (`× [CONVERSATIONS_
     * PAGE_SIZE]` = 10 000, the same hard ceiling as iOS's full-sync —
     * `ConversationSyncEngine+Chargement.swift` — though Android walks more,
     * smaller pages to get there: `validatePagination` (gateway) caps `limit`
     * at 100). [updatedSince] `null` is a FULL sweep (`lastMessageAt DESC`
     * server-side); non-null is a DELTA sweep (`updatedAt` strictly greater
     * than it, `updatedAt ASC, id ASC` server-side) — the ordering differs, but
     * this loop doesn't depend on it: completeness is tracked by advancing
     * `offset` by however many rows the page actually returned, and by walking
     * pages until the server says `hasMore = false`, in EITHER order.
     *
     * A page whose envelope omits `pagination` entirely (absent, not
     * `hasMore = false`) is UNKNOWN completeness, not proven completeness —
     * treating it as "no more pages" is a failure direction backwards for a
     * DELETE (#5186 hardening): it turns a server that forgot to send the
     * block into data loss instead of a merely-stale cache. What was seen is
     * still returned (never discarded), but the sweep stops right there
     * (never proven complete, and pointless to keep paging blind).
     *
     * A transport failure (`NetworkResult.Failure`) throws — for a full sweep
     * this is the pre-existing #5186 contract; for a delta sweep it is the
     * SAME contract, deliberately: [SwrCacheSource]'s caller leaves the cached
     * data untouched on a thrown revalidation and retries at the next natural
     * tick (5-minute cycle or socket-triggered refresh), which re-evaluates
     * delta-vs-full from the UNCHANGED, still-recorded watermark — so a
     * transient failure never needs a same-call fallback to recover.
     */
    private suspend fun sweepPages(updatedSince: String?): SweepOutcome {
        val collected = mutableListOf<ApiConversation>()
        var offset = 0
        var isComplete = false

        for (page in 0 until MAX_PAGES) {
            when (
                val result = pagedApiCall {
                    conversationApi.list(
                        offset = offset,
                        limit = CONVERSATIONS_PAGE_SIZE,
                        updatedSince = updatedSince,
                    )
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

        return SweepOutcome(collected, isComplete)
    }

    /**
     * #5187 — delta-sync. [me.meeshy.core.database.entity.SyncMetaEntity.
     * contentWatermarkMillis] is a proven baseline: the max `updatedAt` seen
     * across a past EXHAUSTIVE sweep. When one exists and is no older than
     * [CachePolicy.Conversations]' `keepForMillis` (24h — the same window iOS's
     * `fullReconcileInterval` and web's `FULL_RECONCILE_INTERVAL_MS` use for
     * their own periodic reconciliation), this asks the server only for
     * conversations updated since that point instead of re-fetching everyone —
     * `GET /conversations?updatedSince=…`. Otherwise (no watermark yet, or one
     * older than the retention window) it falls back to the exhaustive full
     * sweep this class already had.
     *
     * A delta sweep NEVER prunes — its `whereClause` only ever proves a
     * conversation still matches (`isActive`, participant still in it); a
     * conversation that left the view (closed, left, banned, deleted-for-me
     * elsewhere) simply never appears in ANY delta page, which is
     * indistinguishable from "unchanged". Only the full sweep — which sees
     * literally everything — is trusted to delete. A delta sweep that returns
     * nothing (no changes since the watermark) makes ZERO Room writes at all,
     * including to `sync_meta`: there is nothing to upsert, nothing to prune,
     * and no new `updatedAt` to advance the watermark to, so touching the row
     * would only cost a write without changing what it means.
     *
     * The watermark itself only advances when a sweep is PROVEN exhaustive —
     * [SweepOutcome.isComplete] — and is computed from the conversations'
     * OWN `updatedAt` field (the exact column the server's `gt` filter
     * compares against), never from [ConversationEntity.updatedAt]'s
     * fallback-adjusted value (`updatedAt ?? lastMessage.createdAt ??
     * createdAt`), which would desync the watermark from what the server
     * actually filters on. A full sweep that is NOT proven exhaustive does
     * not advance it either: full-sweep pages are ordered by `lastMessageAt`,
     * not `updatedAt`, so an unfinished full sweep's collected rows carry no
     * guarantee that every conversation below the max `updatedAt` seen was
     * also seen — advancing past them would make the next delta skip them
     * forever (`updatedAt gt watermark` is a STRICT bound).
     */
    override suspend fun revalidate() {
        val watermark = syncMetaDao.watermark(RESOURCE_KEY)
        val now = clock.nowMillis()
        val useDelta = watermark != null && (now - watermark) <= CachePolicy.Conversations.keepForMillis

        val outcome = sweepPages(
            updatedSince = if (useDelta) Instant.ofEpochMilli(watermark!!).toString() else null,
        )

        if (useDelta && outcome.conversations.isEmpty()) return

        persist(
            conversations = outcome.conversations,
            prune = !useDelta && outcome.isComplete,
            currentWatermark = watermark,
            advanceWatermark = outcome.isComplete,
        )
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

    private suspend fun persist(
        conversations: List<ApiConversation>,
        prune: Boolean,
        currentWatermark: Long?,
        advanceWatermark: Boolean,
    ) {
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
        // The watermark's own value — NEVER the fallback-adjusted one above —
        // see the doc-comment on [revalidate] for why the two must not merge.
        val receivedMax = if (advanceWatermark) {
            conversations.mapNotNull { isoToEpochMillisOrNull(it.updatedAt) }.maxOrNull()
        } else {
            null
        }
        val watermarkToStore = receivedMax ?: currentWatermark
        database.withTransaction {
            conversationDao.upsertAll(rows)
            if (prune) pruneMissing(rows.map { it.id })
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now, watermarkToStore))
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
