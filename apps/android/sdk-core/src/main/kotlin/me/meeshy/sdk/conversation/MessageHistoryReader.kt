package me.meeshy.sdk.conversation

import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.commitOrWrite

import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import java.time.Instant
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.rawApiCall

/**
 * The read side of a conversation's messages: the cache-first stream, the explicit refresh, the
 * cache-only peek and the backwards pagination. One domain — what the list shows, and how much
 * of the history it holds. Owns the per-conversation observe window that ties them together.
 */
internal class MessageHistoryReader(
    private val messageApi: MessageApi,
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val syncMetaDao: SyncMetaDao,
    private val clock: CacheClock,
    /** #13558 — a page lands only while the account that asked for it is still the one signed in. */
    private val fence: AccountFence? = null,
    /** #13792 — chaque page servie nourrit le registre des régimes. */
    private val regime: EndToEndRegimeKeeper? = null,
    /** Les événements arrivés avant leur message, rejoués à l'ingestion. */
    private val events: MessageEventBuffer? = null,
    /** #14655 — la file durable des clairs E2EE à retirer du coffre. */
    private val erasures: PlaintextErasureLedger? = null,
    /** Les traductions déjà reçues, superposées aux messages servis. */
    private val translations: TranslationLayer? = null,
    /** #16012 — les fichiers locaux de mon envoi suivent la ligne qu'une page sert avant l'accusé. */
    private val media: AcknowledgedBubbleMedia? = null,
) {
    /**
     * #5189 — the nominal-flow observe window, per conversation: how many of
     * the newest rows [MessageCacheSource.observe] is bounded to. Starts at
     * [INITIAL_HISTORY_WINDOW] (bigger than the server's own default
     * recent-window fetch — `limitStr = '20'`, `services/gateway/src/routes/
     * conversations/messages-list.ts:189` — so a fresh sync never overflows
     * it) and grows by exactly as many rows as [loadOlder] actually pages
     * in, so a row that becomes cached stays observable — scroll-back is
     * never truncated by the bound. Held HERE rather than on a
     * [MessageCacheSource] instance: [cacheSource] builds a fresh one on
     * every call (see [messagesStream], [refresh]), and [loadOlder] never
     * touches a cache source at all — a per-instance field would reset on
     * every call and never see [loadOlder]'s growth.
     */
    private val historyWindows = ConcurrentHashMap<String, MutableStateFlow<HistoryWindow>>()

    private fun historyWindow(conversationId: String): MutableStateFlow<HistoryWindow> =
        historyWindows.getOrPut(conversationId) { MutableStateFlow(HistoryWindow.Recent(INITIAL_HISTORY_WINDOW)) }

    /**
     * Cache-first message list for a conversation (ARCHITECTURE.md §4): the
     * cached messages (including optimistic local rows) are served immediately
     * and revalidated in the background.
     */
    fun messagesStream(
        conversationId: String,
        policy: CachePolicy = CachePolicy.Default,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<LocalMessage>>> {
        returnToPresent(conversationId)
        return cacheFirstFlow(policy, cacheSource(conversationId), onRevalidateError = onSyncError)
    }

    /** #14670 — an anchored window gives way to the recent one: a new open, a send, « back to the present ». */
    fun returnToPresent(conversationId: String) {
        historyWindow(conversationId).update { if (it is HistoryWindow.Anchored) HistoryWindow.Recent(INITIAL_HISTORY_WINDOW) else it }
    }

    /**
     * #14670 — « back to the present » from an anchored window: the recent window, and the recent page read
     * from the server. The cache may end where the anchored walk stopped; showing the newest cached rows would
     * then stop in the past, with nothing left to page newer.
     */
    suspend fun jumpToPresent(conversationId: String) {
        if (historyWindow(conversationId).value !is HistoryWindow.Anchored) return
        returnToPresent(conversationId)
        cacheSource(conversationId).revalidatePresent()
    }

    /**
     * #14670 — opens the thread ON [messageId] (a search hit, a link). A message already in the observed
     * window moves nothing; otherwise the window centred on it is read (`around`), merged into Room, and
     * the observed window is anchored on it: from its oldest row to its newest when newer messages remain
     * (paged by [loadNewer]), to the present otherwise. Throws on a network failure.
     */
    suspend fun loadAround(conversationId: String, messageId: String, limit: Int = OLDER_PAGE_SIZE): MessageLanding {
        if (isObserved(conversationId, messageId)) return MessageLanding.InWindow
        val ticket = fence?.currentTicket()
        val response = when (val result = rawApiCall { messageApi.listWindowAround(conversationId, messageId, limit) }) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> throw MessageSyncException(result.error.message)
        }
        if (!response.success) throw MessageSyncException("around window refused")
        val page = response.data
        val stamps = page.mapNotNull { isoToEpochMillisOrNull(it.createdAt) }
        val from = stamps.minOrNull()
        if (page.none { it.id == messageId } || from == null) return MessageLanding.NotFound
        val hasNewer = response.hasNewer == true
        fence.commitOrWrite(ticket) { ingestion().ingest(page, clock.nowMillis()) } ?: return MessageLanding.NotFound
        historyWindow(conversationId).value = HistoryWindow.Anchored(from, if (hasNewer) stamps.max() else null)
        return MessageLanding.Anchored(hasNewer = hasNewer, hasOlder = response.cursorPagination?.hasMore ?: true)
    }

    /**
     * #14670 — forward pagination of an anchored window: the page after its newest row (`after`), merged
     * into Room, the window's newer bound moved to it — or released to the present once the server has
     * nothing newer. Returns whether newer messages remain; inert outside an anchored window.
     */
    suspend fun loadNewer(conversationId: String, pageSize: Int = OLDER_PAGE_SIZE): Boolean {
        val window = historyWindow(conversationId).value as? HistoryWindow.Anchored ?: return false
        val through = window.throughMillis ?: return false
        val ticket = fence?.currentTicket()
        val after = Instant.ofEpochMilli(through).toString()
        val response = when (val result = rawApiCall { messageApi.listAfter(conversationId, after, pageSize) }) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> throw MessageSyncException(result.error.message)
        }
        if (!response.success) throw MessageSyncException("newer page refused")
        val page = response.data
        fence.commitOrWrite(ticket) { ingestion().ingest(page, clock.nowMillis()) } ?: return true
        val newest = page.mapNotNull { isoToEpochMillisOrNull(it.createdAt) }.maxOrNull()
        val reachedPresent = response.cursorPagination?.hasMore != true || newest == null || newest <= through
        // The window may have moved meanwhile (an older page lowered its bound): the newer bound moves on the
        // CURRENT window, never on the snapshot taken before the request — a stale compare dropped it (recette S8).
        historyWindow(conversationId).update { current ->
            if (current !is HistoryWindow.Anchored) current
            else current.copy(throughMillis = if (reachedPresent || current.throughMillis == null) null else maxOf(current.throughMillis, newest ?: through))
        }
        return !reachedPresent
    }

    private suspend fun isObserved(conversationId: String, messageId: String): Boolean =
        when (val window = historyWindow(conversationId).value) {
            is HistoryWindow.Recent -> messageDao.recentForConversation(conversationId, window.size).any { it.id == messageId }
            is HistoryWindow.Anchored -> messageDao.find(messageId)?.takeIf { it.conversationId == conversationId }
                ?.let { it.createdAt >= window.fromMillis && it.createdAt <= (window.throughMillis ?: Long.MAX_VALUE) } == true
        }

    private fun ingestion() = MessageIngestPipeline(database, regime = regime, events = events, erasures = erasures)

    /** Explicit refresh of a conversation's messages (pull / retry). Throws on failure. */
    suspend fun refresh(conversationId: String) {
        cacheSource(conversationId).revalidate()
    }

    /**
     * Targeted completion of ONE message by its id (#13797): the socket payload of a received forward
     * carries `forwardedFromId` without the `forwardedFrom` preview the list route serves, so the
     * thread asks the server for that single message instead of re-reading the page. Best effort —
     * returns whether the row was merged; a failure or a revoked account changes nothing. A [limit] above one
     * reads the WINDOW around the message (the voice note whose transcription `transcription:ready` never brought,
     * with its neighbours' translations) and merges all of it through the same ingestion.
     */
    suspend fun refreshMessage(conversationId: String, messageId: String, limit: Int = 1): Boolean {
        val ticket = fence?.currentTicket()
        val response = when (val result = rawApiCall { messageApi.listAround(conversationId, messageId, limit) }) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> return false
        }
        val page = response.data?.takeIf { response.success } ?: return false
        val target = page.firstOrNull { it.id == messageId } ?: return false
        val served = if (limit > 1) page else listOf(target)
        val now = clock.nowMillis()
        fence.commitOrWrite(ticket) { MessageIngestPipeline(database).ingest(served, now) } ?: return false
        return true
    }

    /**
     * Cache-only read of a conversation's [limit] most recent messages, oldest
     * first — a "peek" surface (hard-press preview card) that must render
     * instantly without a network round-trip. Deliberately skips the
     * background-revalidate half of [messagesStream]'s stale-while-revalidate
     * contract: a preview the user may dismiss within a second should never
     * trigger unbounded background sync work. Empty on a never-synced
     * conversation (mirrors [messagesStream]'s cold-cache [CacheResult.Empty]).
     */
    suspend fun recentMessages(conversationId: String, limit: Int = PREVIEW_LIMIT): List<LocalMessage> =
        messageDao.recentForConversation(conversationId, limit).asReversed().let { rows ->
            translations?.ensureLoaded(rows.map { it.serverId ?: it.id })
            rows.map { row -> row.toLocalMessage().let { translations?.project(it) ?: it } }
        }

    /** Whether the cached window was synced within the messages policy's freshness window. */
    suspend fun isCacheFresh(conversationId: String): Boolean {
        val syncedAt = syncMetaDao.lastSyncedAt("messages:$conversationId") ?: return false
        return clock.nowMillis() - syncedAt < CachePolicy.Messages.freshForMillis
    }

    /**
     * The aperçu's network read: the [limit] newest messages of the conversation, oldest first,
     * served as-is and NOT merged into Room (the preview never rewrites the cache the thread
     * paints from). `null` on any failure — the caller keeps what it already shows.
     */
    suspend fun recentMessagesFromNetwork(conversationId: String, limit: Int = PREVIEW_LIMIT): List<ApiMessage>? {
        val ticket = fence?.currentTicket()
        val response = when (val result = rawApiCall { messageApi.list(conversationId, offset = 0, limit = limit) }) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> return null
        }
        val page = response.data?.takeIf { response.success } ?: return null
        if (ticket != null && fence?.isCurrent(ticket) == false) return null
        return page.sortedBy { isoToEpochMillisOrNull(it.createdAt) ?: 0L }.takeLast(limit)
    }

    /**
     * Backwards pagination: fetches the page of messages older than the oldest
     * cached server row (`before` cursor) and appends it to the Room cache.
     * The freshness watermark is untouched — history pages do not make the
     * newest page fresher. Returns whether more history remains.
     */
    suspend fun loadOlder(conversationId: String, pageSize: Int = OLDER_PAGE_SIZE): Boolean {
        val ticket = fence?.currentTicket()
        val window = historyWindow(conversationId).value
        val cursor = when (window) {
            is HistoryWindow.Recent -> messageDao.oldestSyncedAmongRecent(conversationId, window.size)
            is HistoryWindow.Anchored -> messageDao.oldestSyncedSince(conversationId, window.fromMillis)
        } ?: return true
        val response = when (
            val result = rawApiCall { messageApi.list(conversationId, limit = pageSize, before = cursor.id) }
        ) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> throw MessageSyncException(result.error.message)
        }
        val page = response.data
        if (!response.success || page == null) {
            throw MessageSyncException(response.error ?: response.message ?: "Unknown error")
        }
        val now = clock.nowMillis()
        fence.commitOrWrite(ticket) { ingestion().ingest(page, now) } ?: return true
        // #5189 — grow the observe window by exactly what was just paged in,
        // so these older rows (now cached) are not immediately hidden again
        // by messagesStream's bound. An anchored window lowers its older bound instead.
        if (page.isNotEmpty()) historyWindow(conversationId).update { it.grownBy(page) }
        return response.pagination?.hasMore ?: (page.size >= pageSize)
    }

    private fun HistoryWindow.grownBy(page: List<ApiMessage>): HistoryWindow = when (this) {
        is HistoryWindow.Recent -> copy(size = size + page.size)
        is HistoryWindow.Anchored -> page.mapNotNull { isoToEpochMillisOrNull(it.createdAt) }.minOrNull()
            ?.let { oldest -> copy(fromMillis = minOf(fromMillis, oldest)) } ?: this
    }

    private fun cacheSource(conversationId: String) = MessageCacheSource(
        conversationId = conversationId,
        database = database,
        messageDao = messageDao,
        syncMetaDao = syncMetaDao,
        messageApi = messageApi,
        clock = clock,
        historyWindow = historyWindow(conversationId),
        fence = fence,
        regime = regime,
        events = events,
        erasures = erasures,
        translations = translations,
        media = media,
    )

    companion object {
        const val OLDER_PAGE_SIZE = 30

        /**
         * #5189 — the nominal observe window's starting size (see
         * [historyWindowSizes]'s doc-comment): comfortably above the
         * server's own default recent-window fetch (20 rows) so a fresh
         * sync is never trimmed on first render, and matches
         * [OLDER_PAGE_SIZE] — the one "screen's worth" size this client
         * already reasons in.
         */
        const val INITIAL_HISTORY_WINDOW = OLDER_PAGE_SIZE
        const val PREVIEW_LIMIT = 5
    }
}
