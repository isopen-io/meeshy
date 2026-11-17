package me.meeshy.sdk.conversation

import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite

import androidx.room.withTransaction
import java.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.isoToEpochMillis
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.sync.LiveReceiptsContinuity
import me.meeshy.sdk.model.sync.RecentWindowPrune
import me.meeshy.sdk.model.sync.ThreadContiguity
import me.meeshy.sdk.model.sync.ThreadContiguity.Sweep
import me.meeshy.sdk.net.ConditionalResult
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.listConditionalResult
import me.meeshy.sdk.net.rawApiCall

/** Thrown when a message-list revalidation fails; carries the API error message. */
internal class MessageSyncException(message: String) : Exception(message)

/**
 * Room-backed [SwrCacheSource] for one conversation's messages
 * (ARCHITECTURE.md §4, §6). Each conversation has its own `sync_meta` key so
 * freshness is tracked per conversation.
 *
 * Optimistic local rows (`sendState` non-null) ride along with server rows and
 * are reconciled by `clientMessageId` once the server list includes them.
 *
 * The thread's history held is CONTIGUOUS up to a watermark ([ThreadContiguity], #18929, #19114), kept in the
 * `contentWatermarkMillis` of its key: only contiguous reads move it (the recent window and the forward sweep that joins
 * it, a backward page that closes a gap), never a pushed message, a socket arrival or an acknowledged send. When a gap
 * stays under the recent window, its top is kept under [ThreadSyncKey.gapOf], the thread shows only the segment above it,
 * and backward paging starts there.
 */
internal class MessageCacheSource(
    private val conversationId: String,
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val syncMetaDao: SyncMetaDao,
    private val messageApi: MessageApi,
    private val clock: CacheClock,
    private val historyWindow: Flow<HistoryWindow>,
    /** #13558 — a revalidation lands only while the account that asked for it is still the one signed in. */
    private val fence: AccountFence? = null,
    /** #13792 — chaque page servie nourrit le registre des régimes. */
    private val regime: EndToEndRegimeKeeper? = null,
    /** Les événements arrivés avant leur message, rejoués à l'ingestion. */
    private val events: MessageEventBuffer? = null,
    /** #14655 — un message chiffré que la page dit parti, ou qu'elle ne sert plus, inscrit son effacement. */
    private val erasures: PlaintextErasureLedger? = null,
    /** Les traductions déjà reçues, superposées aux messages servis. */
    private val translations: TranslationLayer? = null,
    /** #16012 — mon envoi servi par la page avant son accusé : ses fichiers locaux suivent la ligne servie. */
    private val media: AcknowledgedBubbleMedia? = null,
    /** #19115 — the thread's single revalidation flight; `null`: a revalidation runs in its caller's job. */
    private val revalidations: ThreadRevalidations? = null,
    /** #19115 — how the stream that drives [revalidate] judges freshness; `null`: [revalidate] always reads. */
    private val streamFreshness: StreamFreshness? = null,
    /**
     * #19049 — under `live-receipts` a 304 says nothing of the receipt counters: the validator leaves only while the socket
     * stayed connected since this thread's last full read; `null` (no socket to keep them): the validator always may.
     */
    private val receipts: LiveReceiptsContinuity? = null,
) : SwrCacheSource<List<LocalMessage>> {

    private val resourceKey = ThreadSyncKey.of(conversationId)
    private val gapKey = ThreadSyncKey.gapOf(conversationId)

    /**
     * Every snapshot write goes through the field-level merge: local columns kept, nothing
     * regresses, pending outbox mutations protected, unchanged rows left unwritten — and the
     * echoed `cid_` bridged to its server id, the optimistic bubble replaced in place.
     */
    private val ingestion = MessageIngestPipeline(database, regime = regime, events = events, erasures = erasures)

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
     *
     * #19114 — while a gap lies under the recent window, the rows below it stay out of what the thread shows: the gap is
     * the top edge of the list, where backward paging fills it, never an invisible jump between two messages.
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    override fun observe(): Flow<List<LocalMessage>?> =
        historyWindow.flatMapLatest { window ->
            combine(
                windowRows(window),
                syncMetaDao.observe(resourceKey),
                shownFrom(window),
            ) { rows, syncedAt, gapTop ->
                if (rows.isEmpty() && syncedAt == null) {
                    null
                } else {
                    val shown = rows.aboveGap(gapTop)
                    translations?.ensureLoaded(shown.map { it.serverId ?: it.id })
                    shown.asReversed().map { row -> row.toLocalMessage().let { translations?.project(it) ?: it } }
                }
            }
        }

    private fun windowRows(window: HistoryWindow) = when (window) {
        is HistoryWindow.Recent -> messageDao.observeRecentForConversation(conversationId, window.size)
        is HistoryWindow.Anchored -> messageDao.observeRangeForConversation(
            conversationId,
            window.fromMillis,
            window.throughMillis ?: Long.MAX_VALUE,
        )
    }

    /** The gap only bounds the recent window; an anchored one shows the island it was opened on. */
    private fun shownFrom(window: HistoryWindow): Flow<Long?> = when (window) {
        is HistoryWindow.Recent -> syncMetaDao.observeWatermark(gapKey)
        is HistoryWindow.Anchored -> flowOf(null)
    }

    /** A local bubble carries a device instant, never comparable with the gap: it always shows. */
    private fun List<MessageEntity>.aboveGap(gapTop: Long?): List<MessageEntity> =
        if (gapTop == null) this else filter { it.sendState != null || it.createdAt >= gapTop }

    override fun lastSyncedAt(): Flow<Long?> = syncMetaDao.observe(resourceKey)

    /**
     * #18915 — every revalidation reads the RECENT WINDOW ([readWindow], conditional: a 304 without a body when
     * nothing changed). It is the only read that sees what happened to messages ALREADY held — an edit, a
     * deletion, a reaction, a pin, a read receipt missed while the socket was away — since `after=` only ever
     * serves messages CREATED after its cursor.
     *
     * The forward sweep ([readGap]) follows only when the page does not reach back to the contiguous history: it starts
     * from the CONTIGUITY watermark (#18929), never from the newest row held — a message a push prefetched ahead of
     * unpushed ones, or one the socket brought during a revalidation, is above them and no sweep started from it reads
     * them back. A sweep stopped at its ceiling (#19114) moves the watermark where it stopped and records the gap.
     *
     * EVERY read comes first, then ONE write ([persist]: window, gap, prune, `sync_meta`). A failed read writes NOTHING
     * and throws: the thread stays stale, and since nothing moved in Room the stream does not emit again — no reread loop.
     * What the revalidation may prune and what it may overwrite are read BEFORE any request ([HeldBefore]).
     *
     * #19115 — the work runs in the thread's single flight ([ThreadRevalidations]): a stream emission (a socket arrival,
     * a receipt, a translation) no longer cancels it and restarts it from zero, so it lands even in an active group. And
     * since the flight is no longer cancelled by the stream, the stream must not start a second one for nothing: it judges
     * a snapshot whose rows and sync instant come from two queries, so the write of a flight that just landed reaches it as
     * new rows with the PREVIOUS instant — a transient Stale. Read again here ([streamFreshness]), the instant says the
     * thread is fresh, and nothing starts.
     */
    override suspend fun revalidate() {
        if (streamFreshness?.isFresh(syncMetaDao.lastSyncedAt(resourceKey)) == true) return
        refresh()
    }

    /** The explicit refresh (pull, retry): always reads, joining the flight in progress. */
    suspend fun refresh() = inFlight { revalidateNow(Sweeping.TO_THE_WINDOW) }

    /**
     * #14670 — « back to the present »: the recent window alone, whatever the cache's newest row, so the present is cached
     * at once. When the window does not reach back to the contiguous history, the gap under it is recorded (#19114): the
     * thread shows the window, backward paging fills the gap from there, and the next revalidation sweeps it.
     */
    suspend fun revalidatePresent() = inFlight { revalidateNow(Sweeping.SKIPPED) }

    private suspend fun inFlight(work: suspend () -> Unit) {
        val flights = revalidations ?: return work()
        flights.join(ThreadRevalidations.Key(conversationId, fence?.currentTicket()), work)
    }

    private enum class Sweeping { TO_THE_WINDOW, SKIPPED }

    private suspend fun revalidateNow(sweeping: Sweeping) {
        val ticket = fence?.currentTicket()
        val held = heldBefore()
        val window = readWindow(ticket, held) ?: return
        val gap = if (sweeping == Sweeping.SKIPPED) GapRead(emptyList(), Sweep.Skipped) else readGap(window.messages, held)
        fence.commitOrWrite(ticket) { persist(window, gap, held) } ?: return
        receipts?.readInFull(conversationId, held.receiptsEpoch)
    }

    /**
     * What a revalidation reads BEFORE any request: nothing written during its flight may move it.
     * - [ids]: the server rows held — the only ones its page may declare gone (#19046 F3, by identity);
     * - [versions]: the newest rows' versions — a row another write moved during the flight keeps what the page may not
     *   undo (#18915);
     * - [upTo] and [contiguity]: where the sweep starts, and whether a validator may be sent (#19046 F12);
     * - [receiptsEpoch] and [receiptsLive]: the socket connection the read starts under, and whether the receipts held
     *   are live enough for a 304 to keep them (#19049);
     * - [threadKnown]: whether the thread existed on the device (its sync key or its conversation row) — what tells,
     *   at write time, a thread purged during the flight from one never cached (audit A2).
     */
    private class HeldBefore(
        val upTo: Long?,
        val contiguity: ThreadContiguity,
        val etag: String?,
        val ids: Set<String>,
        val versions: HeldRowVersions,
        val receiptsEpoch: Long,
        val receiptsLive: Boolean,
        val threadKnown: Boolean,
    )

    private suspend fun heldBefore(): HeldBefore {
        val receiptsEpoch = receipts?.epoch() ?: 0L
        return HeldBefore(
            upTo = messageDao.newestSyncedCreatedAt(conversationId),
            contiguity = ThreadContiguity(syncMetaDao.watermark(resourceKey), syncMetaDao.watermark(gapKey)),
            etag = syncMetaDao.etag(resourceKey),
            ids = messageDao.syncedIds(conversationId).toHashSet(),
            versions = HeldRowVersions.of(messageDao.recentVersions(conversationId, HELD_VERSIONS), HELD_VERSIONS),
            receiptsEpoch = receiptsEpoch,
            receiptsLive = receipts?.mayRevalidateConditionally(conversationId) ?: true,
            threadKnown = syncMetaDao.lastSyncedAt(resourceKey) != null || database.conversationDao().find(conversationId) != null,
        )
    }

    /**
     * Audit A2 — the revalidation runs in a job of its own ([ThreadRevalidations]), out of reach of the screen that asked
     * for it: a thread purged during its flight (« Supprimer pour moi », « Quitter », a conversation deleted) must not come
     * back from its page — up to the whole sweep, and its keys. Known before the request and known by neither its sync
     * key nor its conversation row at write time, it was purged: nothing lands. Read inside the write's transaction.
     */
    private suspend fun purgedDuringFlight(held: HeldBefore): Boolean =
        held.threadKnown && syncMetaDao.lastSyncedAt(resourceKey) == null && database.conversationDao().find(conversationId) == null

    /** The recent window as the server served it, and the validator to keep with it. */
    private class ServedWindow(val messages: List<ApiMessage>, val etag: String?)

    /** The messages read beyond the window, and how far that read went. */
    private class GapRead(val messages: List<ApiMessage>, val sweep: Sweep)

    /**
     * The messages between the contiguity watermark and the window's oldest, read BEFORE anything is written (see
     * [revalidate]). Empty when the window reaches back to the contiguous history; throws when the sweep fails, so nothing is
     * written and the gap stays ahead of the next revalidation. The failure reaches the thread's state: its text names no
     * internal identifier — the thread shows its own localized notice, never this text.
     */
    private suspend fun readGap(window: List<ApiMessage>, held: HeldBefore): GapRead {
        val oldestServed = window.minOfOrNull { isoToEpochMillis(it.createdAt) } ?: return GapRead(emptyList(), Sweep.Complete)
        val from = held.contiguity.sweepFrom(held.upTo)?.takeIf { it < oldestServed }
            ?: return GapRead(emptyList(), Sweep.Complete)
        return tryAfterSweep(Instant.ofEpochMilli(from).toString())
            ?: throw MessageSyncException("The messages missed before the recent window could not be read")
    }

    /**
     * Pages `GET .../messages?after=` up to [MAX_AFTER_PAGES] bounded
     * iterations, advancing [after] to the max `createdAt` seen on each page
     * (ascending order + `skip` pinned to 0 server-side means the `after`
     * value itself is the cursor — [MessageApi.listAfter]'s doc-comment).
     * A sweep that hits its ceiling hands back what it read, as [Sweep.Ceiling] (#14670, #19114): it lands with the
     * window, so the present is always cached, and the gap beyond what it read — more than [MAX_AFTER_PAGES] ×
     * [AFTER_PAGE_SIZE] = 1 000 messages missed — is recorded, filled by backward paging and the next revalidations.
     * A page that says more remain without a readable date to resume from proves no more than what was read: it counts
     * as a ceiling. Returns `null` — never a partial, silently-trusted list — on ANY transport failure, a refused envelope
     * (`success = false`), or a response whose `cursorPagination` (or its `hasMore`) is missing: none of those prove
     * anything about what is actually missing.
     */
    private suspend fun tryAfterSweep(initialAfter: String): GapRead? {
        val collected = mutableListOf<ApiMessage>()
        var after = initialAfter
        repeat(MAX_AFTER_PAGES) {
            when (val result = rawApiCall { messageApi.listAfter(conversationId, after, AFTER_PAGE_SIZE) }) {
                is NetworkResult.Success -> {
                    val body = result.data
                    if (!body.success) return null
                    val rows = body.data
                    collected += rows
                    val hasMore = body.cursorPagination?.hasMore ?: return null
                    if (!hasMore) return GapRead(collected, Sweep.Complete)
                    val maxCreatedAt = rows.mapNotNull { isoToEpochMillisOrNull(it.createdAt) }.maxOrNull()
                        ?: return GapRead(collected, Sweep.Ceiling(newestOf(collected)))
                    after = Instant.ofEpochMilli(maxCreatedAt).toString()
                }
                is NetworkResult.Failure -> return null
            }
        }
        return GapRead(collected, Sweep.Ceiling(newestOf(collected)))
    }

    private fun newestOf(messages: List<ApiMessage>): Long? = messages.mapNotNull { isoToEpochMillisOrNull(it.createdAt) }.maxOrNull()

    /**
     * #5188 — the recent-message window is a single, unvarying request shape
     * per [conversationId] (no offset/limit/before — see [MessageApi.
     * listConditional]'s doc-comment), so unlike [ConversationCacheSource]'s
     * multi-page, multi-scope sweep, ONE stored [me.meeshy.core.database.
     * entity.SyncMetaEntity.etag] is always the exact validator for the next
     * call — no request-key scoping needed. A 304 means "confirmed
     * unchanged": zero body decoded, zero Room writes, `lastSyncedAt`
     * refreshed as any successful revalidation, the contiguity kept. A 304 arriving when no `ETag`
     * was sent is a server anomaly (RFC 7232 defines 304 only as an answer to
     * a conditional request) and throws, rather than being silently read as
     * "unchanged" or as an empty success.
     *
     * #19046 (F12) — the validator leaves only while nothing is held beyond the page it describes and no gap is open
     * ([ThreadContiguity.mayRevalidateConditionally]): a row that arrived after that page and was then deleted, its event
     * missed, left the window identical, and the 304 kept it — with its plaintext.
     *
     * #19049 — and only while the receipts held are live ([LiveReceiptsContinuity]): under `live-receipts` the validator
     * ignores the receipt counters, so after a (re)connection the window is read once WITHOUT it, and the receipts missed
     * during the cut are repaired by the 200.
     *
     * Returns the page to write; `null` after a 304, whose only write —
     * `sync_meta`, the confirmation — is the last step of the revalidation.
     */
    private suspend fun readWindow(ticket: AccountTicket?, held: HeldBefore): ServedWindow? {
        val validator = held.etag?.takeIf { held.contiguity.mayRevalidateConditionally(held.upTo) && held.receiptsLive }
        return when (val result = messageApi.listConditionalResult(conversationId = conversationId, ifNoneMatch = validator)) {
            is ConditionalResult.NotModified -> {
                if (validator == null) {
                    throw MessageSyncException(
                        "Unexpected 304 for messages:$conversationId without If-None-Match sent",
                    )
                }
                fence.commitOrWrite(ticket) {
                    database.withTransaction {
                        if (purgedDuringFlight(held)) return@withTransaction
                        syncMetaDao.upsert(SyncMetaEntity(resourceKey, clock.nowMillis(), held.contiguity.watermark, validator, null))
                    }
                }
                null
            }
            is ConditionalResult.Fresh -> ServedWindow(result.data, result.etag)
            is ConditionalResult.Failure -> throw MessageSyncException(result.error.message)
        }
    }

    /**
     * The ONE write of a revalidation: the window and its gap under the field-level merge (a message served by both
     * keeps the gap's copy, read last), the prune of what the window declares gone ([prune]), the contiguity it proves,
     * and `sync_meta` with the window's validator.
     *
     * The validator is kept only when the page describes every row it served. A row another write touched during the
     * flight keeps its reactions and its pin over the page ([HeldBefore.versions]); when the page served other values for
     * them, its validator would make every later revalidation of a quiet thread a 304, and the kept values would stay for
     * good. It is dropped instead: the next revalidation reads the window again, without `If-None-Match` (#18915).
     */
    private suspend fun persist(window: ServedWindow, gap: GapRead, held: HeldBefore) {
        val now = clock.nowMillis()
        val contiguity = provedBy(window.messages, gap, held)
        val settlements = media?.let { mutableListOf<MessageIngestPipeline.LocalFilesSettlement>() }
        database.withTransaction {
            if (purgedDuringFlight(held)) return@withTransaction
            val merged = ingestion.mergeInTransaction(window.messages + gap.messages, now, conversationId, settlements, held.versions)
            prune(window.messages, held.ids)
            syncMetaDao.upsert(
                SyncMetaEntity(resourceKey, now, contiguity.watermark, window.etag.takeUnless { merged.disavowedServed }, null),
            )
            if (contiguity.gapTop == null) syncMetaDao.delete(gapKey) else syncMetaDao.upsert(SyncMetaEntity(gapKey, now, contiguity.gapTop))
        }
        settlements?.forEach { media?.settle(it.previous, it.written) }
    }

    /** The contiguity the window and its sweep prove; a window with an unreadable date proves nothing, and moves nothing. */
    private fun provedBy(window: List<ApiMessage>, gap: GapRead, held: HeldBefore): ThreadContiguity {
        val instants = window.map { isoToEpochMillisOrNull(it.createdAt) ?: return held.contiguity }
        val span = if (instants.isEmpty()) null else ThreadContiguity.Span(instants.min(), instants.max())
        return held.contiguity.afterRevalidation(held.upTo, span, gap.sweep)
    }

    /**
     * #18915, #19046 — what the recent window declares gone by its absence ([RecentWindowPrune]): the server rows held
     * BEFORE the request (by identity — a row written during the flight, dated ahead or not, is unknown to the page), that
     * rank above the page's cut in the gateway's total order `(createdAt desc, id desc)` — a row of the same millisecond as
     * the oldest served, with a lower id, may be the one the limit cut, alive — and that the page serves under none of
     * their keys. A served date that cannot be read proves nothing: nothing is pruned (fail-closed). The vault being the
     * only copy of a sealed message's plaintext, each pruned row records its erasure (#14655): the same rule governs the
     * row and its plaintext, so no deleted message leaves its plaintext behind, and no live one loses it.
     */
    private suspend fun prune(window: List<ApiMessage>, heldBefore: Set<String>) {
        val served = window.map { RecentWindowPrune.Served(it.id, it.clientMessageId, isoToEpochMillisOrNull(it.createdAt)) }
        val from = served.mapNotNull { it.createdAt }.minOrNull() ?: Long.MIN_VALUE
        val candidates = messageDao.syncedSince(conversationId, from)
        val gone = RecentWindowPrune.gone(
            held = candidates.map { RecentWindowPrune.Held(it.id, it.serverId, it.createdAt) },
            heldBefore = heldBefore,
            page = served,
        ).toHashSet()
        if (gone.isEmpty()) return
        erasures?.recordRemovedRows(candidates.filter { it.id in gone })
        gone.chunked(DELETE_CHUNK).forEach { messageDao.deleteByIds(it) }
    }

    private companion object {
        /** Server max (`validatePagination(..., { maxLimit: 50 })`, messages-list.ts). */
        const val AFTER_PAGE_SIZE = 50

        /** Hard ceiling on one revalidate's gap-catch-up — 20 × 50 = 1 000 messages. */
        const val MAX_AFTER_PAGES = 20

        /**
         * How many of the newest rows a revalidation snapshots before its request (#18915): the recent window the
         * gateway serves (20) and the held rows it may have deleted meanwhile, with room to spare.
         */
        const val HELD_VERSIONS = 50

        /** Under SQLite's 999 bound variables (API 26-29). */
        const val DELETE_CHUNK = 500
    }
}
