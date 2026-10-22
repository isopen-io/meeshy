package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.cacheFirstFlow
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
    private val historyWindowSizes = ConcurrentHashMap<String, MutableStateFlow<Int>>()

    private fun historyWindow(conversationId: String): MutableStateFlow<Int> =
        historyWindowSizes.getOrPut(conversationId) { MutableStateFlow(INITIAL_HISTORY_WINDOW) }

    /**
     * Cache-first message list for a conversation (ARCHITECTURE.md §4): the
     * cached messages (including optimistic local rows) are served immediately
     * and revalidated in the background.
     */
    fun messagesStream(
        conversationId: String,
        policy: CachePolicy = CachePolicy.Default,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<LocalMessage>>> =
        cacheFirstFlow(policy, cacheSource(conversationId), onRevalidateError = onSyncError)

    /** Explicit refresh of a conversation's messages (pull / retry). Throws on failure. */
    suspend fun refresh(conversationId: String) {
        cacheSource(conversationId).revalidate()
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
        messageDao.recentForConversation(conversationId, limit)
            .asReversed()
            .map { it.toLocalMessage() }

    /**
     * Backwards pagination: fetches the page of messages older than the oldest
     * cached server row (`before` cursor) and appends it to the Room cache.
     * The freshness watermark is untouched — history pages do not make the
     * newest page fresher. Returns whether more history remains.
     */
    suspend fun loadOlder(conversationId: String, pageSize: Int = OLDER_PAGE_SIZE): Boolean {
        val cursor = messageDao.oldestSynced(conversationId) ?: return true
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
        database.withTransaction {
            messageDao.upsertAll(page.map { MessageEntityFactory.cached(it, now) })
        }
        // #5189 — grow the observe window by exactly what was just paged in,
        // so these older rows (now cached) are not immediately hidden again
        // by messagesStream's bound.
        if (page.isNotEmpty()) {
            val window = historyWindow(conversationId)
            window.value += page.size
        }
        return response.pagination?.hasMore ?: (page.size >= pageSize)
    }

    private fun cacheSource(conversationId: String) = MessageCacheSource(
        conversationId = conversationId,
        database = database,
        messageDao = messageDao,
        syncMetaDao = syncMetaDao,
        messageApi = messageApi,
        clock = clock,
        historyWindow = historyWindow(conversationId),
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
