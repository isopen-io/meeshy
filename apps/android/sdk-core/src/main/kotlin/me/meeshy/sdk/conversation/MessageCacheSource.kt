package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import java.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.net.ConditionalResult
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.listConditionalResult
import me.meeshy.sdk.net.rawApiCall
import me.meeshy.sdk.util.isoToEpochMillis

/** Thrown when a message-list revalidation fails; carries the API error message. */
internal class MessageSyncException(message: String) : Exception(message)

/**
 * Room-backed [SwrCacheSource] for one conversation's messages
 * (ARCHITECTURE.md §4, §6). Each conversation has its own `sync_meta` key so
 * freshness is tracked per conversation.
 *
 * Optimistic local rows (`sendState` non-null) ride along with server rows and
 * are reconciled by `clientMessageId` once the server list includes them.
 */
internal class MessageCacheSource(
    private val conversationId: String,
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val syncMetaDao: SyncMetaDao,
    private val messageApi: MessageApi,
    private val clock: CacheClock,
    private val historyWindow: Flow<Int>,
) : SwrCacheSource<List<LocalMessage>> {

    private val resourceKey = "messages:$conversationId"

    /**
     * #5189 — bounded to [historyWindow] rather than the conversation's whole
     * cached history: [MessageDao.observeForConversation] (unbounded) re-decoded
     * EVERY row on every Room write in the conversation — a reaction, a
     * translation arriving, a read receipt — however far back the history
     * went. [historyWindow] grows as [MessageRepository.loadOlder] pages more
     * history in, so backwards scroll is unaffected: a row that becomes
     * cached stays observable once the window covers it. `flatMapLatest`
     * re-subscribes [MessageDao.observeRecentForConversation] whenever the
     * window itself grows.
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    override fun observe(): Flow<List<LocalMessage>?> =
        historyWindow.flatMapLatest { limit ->
            combine(
                messageDao.observeRecentForConversation(conversationId, limit),
                syncMetaDao.observe(resourceKey),
            ) { rows, syncedAt ->
                if (rows.isEmpty() && syncedAt == null) {
                    null
                } else {
                    rows.asReversed().map { it.toLocalMessage() }
                }
            }
        }

    override fun lastSyncedAt(): Flow<Long?> = syncMetaDao.observe(resourceKey)

    /**
     * #5206 — forward-watermark gap backfill. When Room already holds a
     * server-confirmed high-water mark for this conversation
     * ([MessageDao.newestSyncedCreatedAt]), periodic revalidation resumes
     * from THERE (`after=<that instant>`) instead of re-fetching the whole
     * recent window — the common "nothing missed" case costs one small,
     * targeted request instead of the full window's body.
     *
     * Falls back to [revalidateFullWindow] (#5188's ETag-aware recent-window
     * fetch) in the SAME call, never a same-tick throw — the full-window path
     * is itself safe, and this is meant to always leave the caller with a
     * successful revalidation. Two cases trigger it: (1) no local high-water
     * mark yet (cold start — nothing to resume FROM), (2) [tryAfterSweep]
     * itself returned `null` (network failure, refused envelope, or a
     * response too untrustworthy to prove `hasMore` either way). "Rien
     * perdu" holds because a gap sweep NEVER writes to Room on failure:
     * [tryAfterSweep] returns either a trustworthy (possibly empty) list, or
     * `null` — only the former is ever persisted, by [persistAfterBackfill],
     * which is APPEND, upsert-only: it never calls [MessageDao.
     * deleteMissingSince]/[MessageDao.deleteMissing] — their window is the
     * FULL recent-window sync's, not this gap's, and running either here
     * would purge legitimate history the gap sweep never asked about.
     *
     * A gap sweep that comes back with NOTHING new (an empty, `hasMore =
     * false` page — the dominant "caught up" case) makes ZERO Room writes at
     * all: nothing to upsert, and the high-water mark it would resume from
     * next time is Room's own live `MAX(createdAt)`, which is already
     * exactly where it was — there is nothing to "advance" separately.
     */
    override suspend fun revalidate() {
        val gapAfterMillis = messageDao.newestSyncedCreatedAt(conversationId)
        if (gapAfterMillis != null) {
            val backfilled = tryAfterSweep(Instant.ofEpochMilli(gapAfterMillis).toString())
            if (backfilled != null) {
                if (backfilled.isNotEmpty()) persistAfterBackfill(backfilled)
                return
            }
        }
        revalidateFullWindow()
    }

    /**
     * Pages `GET .../messages?after=` up to [MAX_AFTER_PAGES] bounded
     * iterations, advancing [after] to the max `createdAt` seen on each page
     * (ascending order + `skip` pinned to 0 server-side means the `after`
     * value itself is the cursor — [MessageApi.listAfter]'s doc-comment).
     * Returns `null` — never a partial, silently-trusted list — on ANY
     * transport failure, a refused envelope (`success = false`), or a
     * response whose `cursorPagination` (or its `hasMore`) is missing: none
     * of those prove anything about what is actually missing, so the caller
     * falls back to the full window rather than trusting a doubtful partial
     * result.
     */
    private suspend fun tryAfterSweep(initialAfter: String): List<ApiMessage>? {
        val collected = mutableListOf<ApiMessage>()
        var after = initialAfter
        for (page in 0 until MAX_AFTER_PAGES) {
            when (val result = rawApiCall { messageApi.listAfter(conversationId, after, AFTER_PAGE_SIZE) }) {
                is NetworkResult.Success -> {
                    val body = result.data
                    if (!body.success) return null
                    val rows = body.data
                    collected += rows
                    val hasMore = body.cursorPagination?.hasMore ?: return null
                    if (!hasMore) return collected
                    val maxCreatedAt = rows.mapNotNull { isoToEpochMillisOrNull(it.createdAt) }.maxOrNull()
                        ?: return collected
                    after = Instant.ofEpochMilli(maxCreatedAt).toString()
                }
                is NetworkResult.Failure -> return null
            }
        }
        return collected
    }

    /**
     * #5188 — the recent-message window is a single, unvarying request shape
     * per [conversationId] (no offset/limit/before — see [MessageApi.
     * listConditional]'s doc-comment), so unlike [ConversationCacheSource]'s
     * multi-page, multi-scope sweep, ONE stored [me.meeshy.core.database.
     * entity.SyncMetaEntity.etag] is always the exact validator for the next
     * call — no request-key scoping needed. A 304 means "confirmed
     * unchanged": zero body decoded, zero Room writes, `lastSyncedAt`
     * refreshed as any successful revalidation. A 304 arriving when no `ETag`
     * was held is a server anomaly (RFC 7232 defines 304 only as an answer to
     * a conditional request) and throws, rather than being silently read as
     * "unchanged" or as an empty success.
     */
    private suspend fun revalidateFullWindow() {
        val currentEtag = syncMetaDao.etag(resourceKey)
        when (
            val result = messageApi.listConditionalResult(
                conversationId = conversationId,
                ifNoneMatch = currentEtag,
            )
        ) {
            is ConditionalResult.NotModified -> {
                if (currentEtag == null) {
                    throw MessageSyncException(
                        "Unexpected 304 for messages:$conversationId without If-None-Match sent",
                    )
                }
                syncMetaDao.upsert(SyncMetaEntity(resourceKey, clock.nowMillis(), null, currentEtag, null))
            }
            is ConditionalResult.Fresh -> persist(result.data, newEtag = result.etag)
            is ConditionalResult.Failure -> throw MessageSyncException(result.error.message)
        }
    }

    private suspend fun persist(messages: List<ApiMessage>, newEtag: String?) {
        val now = clock.nowMillis()
        val rows = messages.map { message ->
            MessageEntity(
                id = message.id,
                conversationId = conversationId,
                seq = null,
                payload = MeeshyApi.json.encodeToString(message),
                createdAt = isoToEpochMillis(message.createdAt),
                cachedAt = now,
            )
        }
        val ackedLocalIds = messages.mapNotNull { it.clientMessageId }
        database.withTransaction {
            messageDao.upsertAll(rows)
            if (ackedLocalIds.isNotEmpty()) messageDao.deleteByIds(ackedLocalIds)
            if (rows.isEmpty()) {
                messageDao.deleteMissing(conversationId, emptyList())
            } else {
                messageDao.deleteMissingSince(
                    conversationId,
                    rows.minOf { it.createdAt },
                    rows.map { it.id },
                )
            }
            syncMetaDao.upsert(SyncMetaEntity(resourceKey, now, null, newEtag, null))
        }
    }

    /**
     * #5206 — persists a gap-backfill sweep. APPEND, upsert-only: see
     * [revalidate]'s doc-comment for why [MessageDao.deleteMissingSince]/
     * [MessageDao.deleteMissing] must never run here. Preserves the CURRENT
     * `etag` untouched — a gap sweep proves nothing about the recent
     * window's own validator, a DIFFERENT request shape entirely.
     */
    private suspend fun persistAfterBackfill(messages: List<ApiMessage>) {
        val now = clock.nowMillis()
        val rows = messages.map { message ->
            MessageEntity(
                id = message.id,
                conversationId = conversationId,
                seq = null,
                payload = MeeshyApi.json.encodeToString(message),
                createdAt = isoToEpochMillis(message.createdAt),
                cachedAt = now,
            )
        }
        val ackedLocalIds = messages.mapNotNull { it.clientMessageId }
        val currentEtag = syncMetaDao.etag(resourceKey)
        database.withTransaction {
            messageDao.upsertAll(rows)
            if (ackedLocalIds.isNotEmpty()) messageDao.deleteByIds(ackedLocalIds)
            syncMetaDao.upsert(SyncMetaEntity(resourceKey, now, null, currentEtag, null))
        }
    }

    private companion object {
        /** Server max (`validatePagination(..., { maxLimit: 50 })`, messages-list.ts). */
        const val AFTER_PAGE_SIZE = 50

        /** Hard ceiling on one revalidate's gap-catch-up — 20 × 50 = 1 000 messages. */
        const val MAX_AFTER_PAGES = 20
    }
}
