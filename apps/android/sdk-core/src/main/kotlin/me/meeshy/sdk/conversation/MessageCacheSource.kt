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
) : SwrCacheSource<List<LocalMessage>> {

    private val resourceKey = "messages:$conversationId"

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
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    override fun observe(): Flow<List<LocalMessage>?> =
        historyWindow.flatMapLatest { window ->
            combine(
                windowRows(window),
                syncMetaDao.observe(resourceKey),
            ) { rows, syncedAt ->
                if (rows.isEmpty() && syncedAt == null) {
                    null
                } else {
                    translations?.ensureLoaded(rows.map { it.serverId ?: it.id })
                    rows.asReversed().map { row -> row.toLocalMessage().let { translations?.project(it) ?: it } }
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

    override fun lastSyncedAt(): Flow<Long?> = syncMetaDao.observe(resourceKey)

    /**
     * #18915 — every revalidation reads the RECENT WINDOW ([readWindow], conditional: a 304 without a body when
     * nothing changed). It is the only read that sees what happened to messages ALREADY held — an edit, a
     * deletion, a reaction, a pin, a read receipt missed while the socket was away — since `after=` only ever
     * serves messages CREATED after the high-water mark: the forward-only revalidation of #5206 left them stale
     * for good, reopening and pulling included.
     *
     * The forward sweep (#5206, [readGap]) follows only when the page does not reach back to what was held — its
     * oldest message is newer than the high-water mark — and reads the gap between the two. A message a push
     * prefetched ahead of unpushed ones raises the high-water mark too: the window brings back what came before
     * it (a hole wider than the window still waits for a contiguity watermark, never moved by a push).
     *
     * EVERY read comes first, then ONE write ([persist]: window, gap, prune, `sync_meta`). The thread revalidates
     * inside the stream's `transformLatest`, and any Room write of this revalidation makes the stream emit — which
     * cancels it. Written before the sweep, the window cancelled the very sweep it needed and made the thread
     * fresh with its high-water mark above the gap, which then no revalidation nor backwards page ever filled.
     * A failed read writes NOTHING and throws: the thread stays stale with its gap still ahead, and since nothing
     * moved in Room the stream does not emit again — no reread loop.
     *
     * The high-water mark is read BEFORE any request: the page prunes only what was held before it left
     * ([prunableSpan]). So are the versions of the newest rows ([heldVersions]): a row another write moved
     * during the flight (a reaction, a pin the socket brought) keeps them over the page built before. Every
     * success writes `sync_meta` — a 304 as much as a page — so a revalidation that found nothing new still
     * leaves the cache fresh, and the next Room write (a receipt, a translation) starts no new request.
     */
    override suspend fun revalidate() {
        val ticket = fence?.currentTicket()
        val heldUpTo = messageDao.newestSyncedCreatedAt(conversationId)
        val heldBefore = heldVersions()
        val window = readWindow(ticket) ?: return
        val gap = readGap(window.messages, heldUpTo)
        fence.commitOrWrite(ticket) { persist(window, gap, heldUpTo, heldBefore) }
    }

    /**
     * #14670 — « back to the present »: the recent window alone, whatever the cache's newest row. After a jump
     * to an old message the cache's high-water mark is that island's, so a gap sweep would walk from there and
     * stop [MAX_AFTER_PAGES] later, still in the past — the gap is paged by scrolling instead. The high-water
     * mark is still read before the request: it bounds what the page may prune (#18915).
     */
    suspend fun revalidatePresent() {
        val ticket = fence?.currentTicket()
        val heldUpTo = messageDao.newestSyncedCreatedAt(conversationId)
        val heldBefore = heldVersions()
        val window = readWindow(ticket) ?: return
        fence.commitOrWrite(ticket) { persist(window, gap = emptyList(), heldUpTo = heldUpTo, heldBefore = heldBefore) }
    }

    /** The versions of the newest rows, read BEFORE the request: what the page may not undo (#18915). */
    private suspend fun heldVersions(): HeldRowVersions =
        HeldRowVersions.of(messageDao.recentVersions(conversationId, HELD_VERSIONS), HELD_VERSIONS)

    /** The recent window as the server served it, and the validator to keep with it. */
    private class ServedWindow(val messages: List<ApiMessage>, val etag: String?)

    /**
     * The messages between [heldUpTo] and the window's oldest, read BEFORE anything is written (see [revalidate]).
     * Empty when the window reaches back to what was held; throws when the sweep fails, so nothing is written and
     * the gap stays ahead of the next revalidation.
     */
    private suspend fun readGap(window: List<ApiMessage>, heldUpTo: Long?): List<ApiMessage> {
        val oldestServed = window.minOfOrNull { isoToEpochMillis(it.createdAt) } ?: return emptyList()
        val gapFrom = heldUpTo?.takeIf { it < oldestServed } ?: return emptyList()
        return tryAfterSweep(Instant.ofEpochMilli(gapFrom).toString())
            ?: throw MessageSyncException("The gap before the recent window of messages:$conversationId could not be read")
    }

    /**
     * Pages `GET .../messages?after=` up to [MAX_AFTER_PAGES] bounded
     * iterations, advancing [after] to the max `createdAt` seen on each page
     * (ascending order + `skip` pinned to 0 server-side means the `after`
     * value itself is the cursor — [MessageApi.listAfter]'s doc-comment).
     * A sweep that hits its ceiling hands back what it read (#14670): it lands
     * with the window, and what lies beyond the ceiling is paged by scrolling
     * up. Returns `null` — never a partial, silently-trusted list —
     * on ANY transport failure, a refused envelope (`success = false`), or a
     * response whose `cursorPagination` (or its `hasMore`) is missing: none
     * of those prove anything about what is actually missing.
     */
    private suspend fun tryAfterSweep(initialAfter: String): List<ApiMessage>? {
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
     *
     * Returns the page to write; `null` after a 304, whose only write —
     * `sync_meta`, the confirmation — is the last step of the revalidation.
     */
    private suspend fun readWindow(ticket: AccountTicket?): ServedWindow? {
        val currentEtag = syncMetaDao.etag(resourceKey)
        return when (
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
                fence.commitOrWrite(ticket) {
                    syncMetaDao.upsert(SyncMetaEntity(resourceKey, clock.nowMillis(), null, currentEtag, null))
                }
                null
            }
            is ConditionalResult.Fresh -> ServedWindow(result.data, result.etag)
            is ConditionalResult.Failure -> throw MessageSyncException(result.error.message)
        }
    }

    /**
     * The ONE write of a revalidation: the window and its gap under the field-level merge (a message served by both
     * keeps the gap's copy, read last), the prune of the held span the window covers, and `sync_meta` with the
     * window's validator — the gap's rows are all newer than [heldUpTo], so they never widen the prune.
     *
     * The validator is kept only when the page describes every row it served. A row another write touched during the
     * flight keeps its reactions and its pin over the page ([heldBefore]); when the page served other values for them,
     * its validator would make every later revalidation of a quiet thread a 304, and the kept values would stay for
     * good. It is dropped instead: the next revalidation reads the window again, without `If-None-Match` (#18915).
     */
    private suspend fun persist(window: ServedWindow, gap: List<ApiMessage>, heldUpTo: Long?, heldBefore: HeldRowVersions) {
        val now = clock.nowMillis()
        val rows = window.messages.map { MessageEntityFactory.cached(it, cachedAt = now, conversationId = conversationId) }
        val servedIds = rows.map { it.id }
        val span = prunableSpan(rows, heldUpTo)
        val settlements = media?.let { mutableListOf<MessageIngestPipeline.LocalFilesSettlement>() }
        database.withTransaction {
            val merged = ingestion.mergeInTransaction(window.messages + gap, now, conversationId, settlements, heldBefore)
            span?.let {
                erasures?.recordRemovedRows(pruned(window.messages, it, servedIds))
                messageDao.deleteMissingBetween(conversationId, it.first, it.last, servedIds)
            }
            syncMetaDao.upsert(SyncMetaEntity(resourceKey, now, null, window.etag.takeUnless { merged.disavowedServed }, null))
        }
        settlements?.forEach { media?.settle(it.previous, it.written) }
    }

    /**
     * #18915 — ce qu'une page de la fenêtre récente peut dire supprimé par son absence : les lignes serveur DÉTENUES
     * avant la requête ([heldUpTo], lu avant tout réseau) que la page couvre — à partir de son plus ancien message, ou
     * tout ce qui est détenu sous une page vide. Une ligne arrivée pendant le vol (socket, accusé de mon envoi, rejeu de
     * la file) porte une horloge serveur postérieure à [heldUpTo] : elle n'est ni élaguée ni inscrite au coffre. Les
     * deux bornes sont des horloges serveur : aucune dérive d'horloge locale. À froid, rien n'est détenu : `null`.
     */
    private fun prunableSpan(rows: List<MessageEntity>, heldUpTo: Long?): LongRange? {
        val through = heldUpTo ?: return null
        val from = rows.minOfOrNull { it.createdAt } ?: Long.MIN_VALUE
        return (from..through).takeUnless { it.isEmpty() }
    }

    /**
     * #14655 — les lignes serveur que l'élagage va retirer : celles du [span] détenu que la page ne sert plus, sous aucune
     * de leurs clés (id, id serveur, `cid_`). Une bulle remplacée par sa jumelle serveur n'en est pas une. Le coffre étant
     * la seule copie du clair d'un message chiffré, chaque ligne élaguée inscrit son effacement (#18915) : la même borne
     * gouverne la ligne et son clair, si bien que le message supprimé le plus récent n'en laisse plus derrière lui.
     */
    private suspend fun pruned(messages: List<ApiMessage>, span: LongRange, servedIds: List<String>): List<MessageEntity> {
        val served = messages.flatMap { listOfNotNull(it.id, it.clientMessageId) }.toSet()
        return messageDao.missingBetween(conversationId, span.first, span.last, servedIds)
            .filter { row -> row.id !in served && row.serverId !in served }
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
    }
}
