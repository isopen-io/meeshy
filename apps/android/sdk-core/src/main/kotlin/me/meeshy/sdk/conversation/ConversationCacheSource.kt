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
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.EndToEndRegimeMemory
import me.meeshy.sdk.model.isDirect
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.keepingParticipantsOf
import me.meeshy.sdk.model.namesTwoPeople
import me.meeshy.sdk.net.ConditionalResult
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.listConditionalResult
import me.meeshy.sdk.net.PagedResult
import me.meeshy.sdk.net.pagedApiCall
import me.meeshy.sdk.model.sync.PageFetchPlan
import me.meeshy.sdk.model.sync.SyncOwnership
import me.meeshy.sdk.sync.SyncAccountProvider
import me.meeshy.sdk.sync.SyncCheckpointStore
import me.meeshy.sdk.sync.fetchPageWithRetry
import me.meeshy.sdk.sync.fetchPagesInParallel
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.search.LocalSearchIndex
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
    private val searchIndex: LocalSearchIndex,
    private val accountProvider: SyncAccountProvider = SyncAccountProvider.None,
    private val checkpoints: SyncCheckpointStore = SyncCheckpointStore(syncMetaDao),
    private val ownership: SyncOwnership<Unit> = SyncOwnership(),
    /** Conversations created here moments ago: a full sweep that does not serve them yet keeps them. */
    private val protectedIds: () -> Set<String> = { emptySet() },
    /** #12956 — the conversations this account has seen end-to-end encrypted: never served back in clear. */
    private val endToEnd: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
) : SwrCacheSource<List<ApiConversation>> {

    /** The account whose cached e2ee rows were already folded into [endToEnd] (rows cached before #12956). */
    private var seededAccount: String? = null

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
     * The outcome of one paginated sweep. [isComplete] — walked every page to
     * `hasMore = false` — gates pruning (#5186) and the watermark advance
     * (#5187). [notModified] and [capturedEtag] are #5188: a 304 on page 1
     * short-circuits the WHOLE sweep ([notModified] `true`, everything else at
     * its default/empty); [capturedEtag] is the page-1 response's `ETag`
     * header, captured ONLY when page 1 ALONE proved the sweep complete (see
     * [sweepPages] for why a page-1 ETag is unsafe to store otherwise).
     */
    private class SweepOutcome(
        val conversations: List<ApiConversation> = emptyList(),
        val isComplete: Boolean = false,
        val notModified: Boolean = false,
        val capturedEtag: String? = null,
    )

    /**
     * Pages through `GET /conversations` up to [PageFetchPlan.MAX_PAGES] (`× [PageFetchPlan.
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
     * A transport failure (`NetworkResult.Failure`/[ConditionalResult.Failure])
     * throws — for a full sweep this is the pre-existing #5186 contract; for a
     * delta sweep it is the SAME contract, deliberately: [SwrCacheSource]'s
     * caller leaves the cached data untouched on a thrown revalidation and
     * retries at the next natural tick (5-minute cycle or socket-triggered
     * refresh), which re-evaluates delta-vs-full from the UNCHANGED,
     * still-recorded watermark — so a transient failure never needs a
     * same-call fallback to recover.
     *
     * #5188 — ONLY page 1 is conditional (`If-None-Match: [ifNoneMatch]`,
     * `null` sends none). Pages 2+ always use the plain, unconditional [list],
     * unchanged from #5187. This is deliberate, not an oversight: an `ETag`
     * hashes ONE exact response body (`sendWithETag`, `core-list.ts:892-906`),
     * so a page-1 304 can only be trusted to mean "the ENTIRE sweep is
     * unchanged" when page 1 ALONE was already proven sufficient (`hasMore =
     * false`) the time [ifNoneMatch] was captured — otherwise a byte-identical
     * page 1 says nothing about whether page 2+ picked up new changes since
     * (full sweep: newest-first order, so page 1 changing is actually the
     * LIKELY case when anything changes; delta: oldest-first, so brand-new
     * changes land on LATER pages precisely when page 1 stays identical). The
     * caller ([revalidate]) enforces this: it only ever passes an
     * [ifNoneMatch] captured from a page-1-sufficient response, via
     * [SyncMetaEntity.etagRequestKey] matching. A 304 arriving when
     * [ifNoneMatch] was `null` is a server anomaly — RFC 7232 defines 304 only
     * as an answer to a conditional request — and throws rather than being
     * silently read as either "unchanged" (could hide data loss) or "empty
     * success" (no body was ever decoded).
     */
    private suspend fun sweepPages(updatedSince: String?, ifNoneMatch: String?): SweepOutcome {
        val first = when (
            val result = conversationApi.listConditionalResult(
                offset = 0,
                limit = PageFetchPlan.PAGE_SIZE,
                updatedSince = updatedSince,
                ifNoneMatch = ifNoneMatch,
            )
        ) {
            is ConditionalResult.NotModified -> {
                if (ifNoneMatch == null) {
                    throw ConversationSyncException(
                        "Unexpected 304 for conversations without If-None-Match sent",
                    )
                }
                return SweepOutcome(notModified = true)
            }
            is ConditionalResult.Fresh -> result
            is ConditionalResult.Failure -> throw ConversationSyncException(result.error.message)
        }
        // Unknown completeness — never infer "done" from a missing block.
        val pagination = first.pagination ?: return SweepOutcome(first.data)
        if (!pagination.hasMore) return SweepOutcome(first.data, isComplete = true, capturedEtag = first.etag)
        val rest = loadRemainingPages(first.data, pagination.total, updatedSince)
        return SweepOutcome(first.data + rest.rows, rest.isComplete)
    }

    private class RemainingPages(val rows: List<ApiConversation>, val isComplete: Boolean)

    private suspend fun fetchPage(offset: Int, updatedSince: String?): PagedResult<List<ApiConversation>> =
        when (
            val result = pagedApiCall {
                conversationApi.list(offset = offset, limit = PageFetchPlan.PAGE_SIZE, updatedSince = updatedSince)
            }
        ) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> throw ConversationSyncException(result.error.message)
        }

    /**
     * Pages 2+ : en parallèle (4 au plus, réessai par page, pages perdues récupérées) quand le
     * serveur annonce son total ; sinon, ou si la voie parallèle échoue, la boucle séquentielle
     * d'origine, bornée à [PageFetchPlan.MAX_TAIL_ITERATIONS] itérations.
     */
    private suspend fun loadRemainingPages(
        firstPage: List<ApiConversation>,
        total: Int?,
        updatedSince: String?,
    ): RemainingPages {
        val planned = PageFetchPlan.remainingPageIndices(total, firstPage.size)
        if (planned.isNotEmpty()) {
            val parallel = try {
                loadInParallel(firstPage.size, planned, updatedSince)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                null
            }
            if (parallel != null) return parallel
        }
        return loadSequentially(firstPage, updatedSince)
    }

    private suspend fun loadInParallel(firstCount: Int, planned: List<Int>, updatedSince: String?): RemainingPages {
        val stride = PageFetchPlan.stride(firstCount)
        val fetch: suspend (Int) -> PagedResult<List<ApiConversation>> =
            { index -> fetchPage(PageFetchPlan.offsetOf(index, stride), updatedSince) }
        val pages = fetchPagesInParallel(planned, fetch = fetch).toMutableMap()
        for (lost in PageFetchPlan.droppedPages(planned, pages.keys)) {
            pages[lost] = fetchPageWithRetry { fetch(lost) }.getOrNull() ?: break
        }
        val rows = planned.mapNotNull { pages[it] }.flatMap { it.data }
        if (pages.keys.size < planned.size) return RemainingPages(rows, isComplete = false)
        val last = pages.getValue(planned.last()).pagination ?: return RemainingPages(rows, isComplete = false)
        if (!last.hasMore) return RemainingPages(rows, isComplete = true)
        val more = loadSequentially(emptyList(), updatedSince, startOffset = firstCount + rows.size)
        return RemainingPages(rows + more.rows, more.isComplete)
    }

    private suspend fun loadSequentially(
        firstPage: List<ApiConversation>,
        updatedSince: String?,
        startOffset: Int = firstPage.size,
    ): RemainingPages {
        val seen = firstPage.mapTo(HashSet()) { it.id }
        val rows = mutableListOf<ApiConversation>()
        var tail = PageFetchPlan.Tail(offset = startOffset, hasMore = true)
        while (tail.canContinue) {
            val page = fetchPage(tail.offset, updatedSince)
            val pagination = page.pagination ?: return RemainingPages(rows, isComplete = false)
            val fresh = page.data.count { seen.add(it.id) }
            rows += page.data
            if (!pagination.hasMore) return RemainingPages(rows, isComplete = true)
            tail = PageFetchPlan.advance(tail, returned = page.data.size, newItems = fresh, backendHasMore = true)
        }
        return RemainingPages(rows, isComplete = false)
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
     * nothing new (no changes since the watermark, AND no fresh `ETag` to
     * remember) makes ZERO Room writes at all, including to `sync_meta`.
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
     *
     * #5188 — a 304 ([SweepOutcome.notModified]) NEVER advances the content
     * watermark either, even though it IS treated as a successful revalidation
     * for freshness (`lastSyncedAt`): it proves "nothing new since I last
     * asked", not "I have now seen everything up to this instant" — the
     * distinction matters the moment the watermark's age crosses the 24h
     * full-sweep threshold, where "nothing new" must not be conflated with
     * "exhaustively confirmed current".
     */
    override suspend fun revalidate() {
        val account = accountProvider.activeAccountId()
        if (account != null) ownership.claim(account)
        try {
            revalidateOwned(account)
        } finally {
            if (account != null) ownership.release(account)
        }
    }

    private suspend fun revalidateOwned(account: String?) {
        val watermark = syncMetaDao.watermark(RESOURCE_KEY)
        val currentEtag = syncMetaDao.etag(RESOURCE_KEY)
        val currentEtagScope = syncMetaDao.etagRequestKey(RESOURCE_KEY)
        val now = clock.nowMillis()
        val useDelta = watermark != null && (now - watermark) <= CachePolicy.Conversations.keepForMillis
        val updatedSince = if (useDelta) Instant.ofEpochMilli(watermark!!).toString() else null
        val requestScope = updatedSince ?: FULL_SWEEP_ETAG_SCOPE
        val ifNoneMatch = currentEtag?.takeIf { currentEtagScope == requestScope }

        val outcome = sweepPages(updatedSince, ifNoneMatch)

        // The account left during the sweep: its pages must not land in the next account's cache.
        if (!ownership.owns(account)) return

        if (outcome.notModified) {
            // Confirmed unchanged: zero body decoded, zero Room writes beyond
            // freshness — watermark, etag and its scope all carry over as-is.
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now, watermark, currentEtag, currentEtagScope))
            recordCheckpoint(account, now, pruned = false, fullReconcile = false)
            return
        }

        if (useDelta && outcome.conversations.isEmpty() && outcome.capturedEtag == null) return

        persist(
            conversations = outcome.conversations,
            prune = !useDelta && outcome.isComplete,
            currentWatermark = watermark,
            advanceWatermark = outcome.isComplete,
            etag = outcome.capturedEtag ?: currentEtag,
            etagScope = if (outcome.capturedEtag != null) requestScope else currentEtagScope,
        )
        val prunedNow = !useDelta && outcome.isComplete
        recordCheckpoint(account, now, pruned = prunedNow, fullReconcile = prunedNow)
    }

    private suspend fun recordCheckpoint(account: String?, now: Long, pruned: Boolean, fullReconcile: Boolean) {
        if (account == null || !ownership.owns(account)) return
        checkpoints.write(account, checkpoints.read(account).advanced(now, pruned, fullReconcile))
    }

    /**
     * Deletes stale rows by computing the delete-set in Kotlin — `localIds -
     * keptIds` — rather than a single `DELETE ... WHERE id NOT IN (:keptIds)`.
     *
     * SQLite caps bound variables per statement at `SQLITE_MAX_VARIABLE_NUMBER`
     * — 999 on Android API 26-29 (raised on later releases, but `minSdk = 26`
     * makes 999 the floor this app must hold under). [PageFetchPlan.MAX_PAGES] ×
     * [PageFetchPlan.PAGE_SIZE] deliberately allows sweeping up to 10 000
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
        val kept = keptIds.toHashSet().apply { addAll(protectedIds()) }
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
        etag: String?,
        etagScope: String?,
    ) {
        val now = clock.nowMillis()
        // The watermark's own value — NEVER the fallback-adjusted one in [entityOf] — see the
        // doc-comment on [revalidate] for why the two must not merge.
        val receivedMax = if (advanceWatermark) {
            conversations.mapNotNull { isoToEpochMillisOrNull(it.updatedAt) }.maxOrNull()
        } else {
            null
        }
        val watermarkToStore = receivedMax ?: currentWatermark
        database.withTransaction {
            seedEndToEndFromCache()
            val carried = conversations.map { keepingEndToEnd(carryingKnownPeers(it)) }
            val rows = carried.map { entityOf(it, now) }
            conversationDao.upsertAll(rows)
            carried.forEach(searchIndex::indexConversation)
            if (prune) pruneMissing(rows.map { it.id })
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now, watermarkToStore, etag, etagScope))
        }
    }

    /**
     * Stores one conversation the app has just been handed outside a list sweep (a direct found
     * or created for a story/mood reply or a profile's Message button), so the chat screen — which
     * reads the Room row — has it before the next sweep serves it. Same carry rule as a sweep.
     */
    suspend fun remember(conversation: ApiConversation) {
        val now = clock.nowMillis()
        database.withTransaction {
            seedEndToEndFromCache()
            val carried = keepingEndToEnd(carryingKnownPeers(conversation))
            conversationDao.upsertAll(listOf(entityOf(carried, now)))
            searchIndex.indexConversation(carried)
        }
    }

    /**
     * A served direct row that names fewer than two people has not elected an interlocutor
     * (`GET /sync`-shaped rows carry no roster, #11615): it takes the roster the cache knows
     * instead of overwriting it, so the row never falls back to the generic name on a sync that
     * simply did not serve its participants. Must run inside the write transaction.
     */
    private suspend fun carryingKnownPeers(served: ApiConversation): ApiConversation {
        if (!served.isDirect || served.namesTwoPeople) return served
        val known = conversationDao.find(served.id)
            ?.let { runCatching { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }.getOrNull() }
        return served.keepingParticipantsOf(known)
    }

    /**
     * #12956 — a conversation served e2ee is learned; one this account has seen e2ee keeps its
     * e2ee mode whatever the gateway serves next (#12949): a downgrade is ignored, never applied.
     */
    private fun keepingEndToEnd(served: ApiConversation): ApiConversation {
        if (EndToEndRegime.isEndToEnd(served.encryptionMode)) endToEnd.learn(served.id)
        return EndToEndRegimeMemory.kept(served, seenEndToEnd = endToEnd.isSealed(served.id))
    }

    /** Rows cached e2ee before the ledger existed are learned once per account. Must run inside the write transaction. */
    private suspend fun seedEndToEndFromCache() {
        val account = accountProvider.activeAccountId() ?: return
        if (seededAccount == account) return
        conversationDao.payloadsContaining(E2EE_PAYLOAD_NEEDLE)
            .filter { row ->
                runCatching { MeeshyApi.json.decodeFromString<ApiConversation>(row.payload) }.getOrNull()
                    ?.let { EndToEndRegime.isEndToEnd(it.encryptionMode) } == true
            }
            .forEach { endToEnd.learn(it.id) }
        seededAccount = account
    }

    private fun entityOf(conversation: ApiConversation, cachedAtMillis: Long) = ConversationEntity(
        id = conversation.id,
        payload = MeeshyApi.json.encodeToString(conversation),
        updatedAt = isoToEpochMillis(
            conversation.updatedAt
                ?: conversation.lastMessage?.createdAt
                ?: conversation.createdAt,
        ),
        cachedAt = cachedAtMillis,
        unreadCount = conversation.unreadCount,
    )

    internal companion object {
        const val RESOURCE_KEY: String = "conversations"

        /** How a cached e2ee row reads in its serialized payload (`MeeshyApi.json`, compact). */
        private const val E2EE_PAYLOAD_NEEDLE = "\"encryptionMode\":\"e2ee\""

        /**
         * Bound-variable budget per [ConversationDao.deleteByIds] call — under
         * the 999-per-statement floor `minSdk = 26` (API 26-29) enforces.
         */
        private const val DELETE_CHUNK_SIZE = 900

        /**
         * [SyncMetaEntity.etagRequestKey] sentinel for a FULL sweep
         * (`updatedSince` absent) — #5188. Never equal to a real `updatedSince`
         * value, which is always a well-formed ISO-8601 instant.
         */
        private const val FULL_SWEEP_ETAG_SCOPE = "full-sweep"
    }
}
