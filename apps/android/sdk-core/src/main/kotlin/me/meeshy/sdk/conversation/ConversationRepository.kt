package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.ConversationPrefsPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ConversationRepository @Inject constructor(
    private val conversationApi: ConversationApi,
    private val database: MeeshyDatabase,
    private val conversationDao: ConversationDao,
    syncMetaDao: SyncMetaDao,
    private val outboxRepository: OutboxRepository,
) {
    private val cacheSource = ConversationCacheSource(
        database = database,
        conversationDao = conversationDao,
        syncMetaDao = syncMetaDao,
        conversationApi = conversationApi,
        clock = SystemCacheClock,
    )

    /**
     * Cache-first conversation list (ARCHITECTURE.md §4): the cached list is
     * served immediately and revalidated in the background. [onSyncError]
     * surfaces a failed background revalidation so the UI can leave its skeleton.
     */
    fun conversationsStream(
        policy: CachePolicy = CachePolicy.Default,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<ApiConversation>>> =
        cacheFirstFlow(policy, cacheSource, onRevalidateError = onSyncError)

    /**
     * Cache-first single conversation: the Room row written by the list sync,
     * decoded on the fly. Emits null until the conversation is cached.
     */
    fun conversationStream(id: String): Flow<ApiConversation?> =
        conversationDao.observeById(id).map { row ->
            row?.let { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }
        }

    /** Explicit refresh (pull-to-refresh / retry). Throws on failure. */
    suspend fun refresh() {
        cacheSource.revalidate()
    }

    suspend fun getById(id: String): NetworkResult<ApiConversation> =
        apiCall { conversationApi.getById(id) }

    suspend fun create(
        type: String,
        title: String?,
        participantIds: List<String>,
    ): NetworkResult<ApiConversation> =
        apiCall { conversationApi.create(CreateConversationRequest(type, title, participantIds)) }

    suspend fun markRead(id: String): NetworkResult<Unit> =
        apiCall { conversationApi.markRead(id) }

    /**
     * Optimistic mark-as-read (ARCHITECTURE.md §5): the cached badge drops to
     * zero instantly and a `READ_RECEIPT` mutation joins its outbox lane (the
     * coalescer merges repeats). No-op when the conversation is unknown or
     * already read. Returns whether anything was queued.
     */
    suspend fun markReadOptimistic(id: String): Boolean {
        val updated = database.withTransaction {
            val row = conversationDao.find(id) ?: return@withTransaction false
            val conversation = MeeshyApi.json.decodeFromString<ApiConversation>(row.payload)
            if (conversation.unreadCount == 0) return@withTransaction false
            conversationDao.upsertAll(
                listOf(
                    row.copy(
                        payload = MeeshyApi.json.encodeToString(conversation.copy(unreadCount = 0)),
                    ),
                ),
            )
            true
        }
        if (!updated) return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.READ_RECEIPT,
                lane = OutboxLanes.READ_RECEIPT,
                targetId = id,
                payload = "{}",
            ),
        )
        return true
    }

    /** Optimistic pin/unpin toggle (swipe action + context menu). */
    suspend fun setPinnedOptimistic(id: String, pinned: Boolean): Boolean =
        updatePreferencesOptimistic(id) { it.copy(isPinned = pinned) }

    /** Optimistic mute/unmute toggle. */
    suspend fun setMutedOptimistic(id: String, muted: Boolean): Boolean =
        updatePreferencesOptimistic(id) { it.copy(isMuted = muted) }

    /** Optimistic archive/unarchive toggle. */
    suspend fun setArchivedOptimistic(id: String, archived: Boolean): Boolean =
        updatePreferencesOptimistic(id) { it.copy(isArchived = archived) }

    /**
     * Optimistic per-conversation preference update (ARCHITECTURE.md §5): the
     * cached preferences mutate instantly (the filter re-derives the visible
     * list) and a full-snapshot `UPDATE_CONVERSATION_PREFS` mutation joins the
     * shared prefs lane, where the coalescer keeps only the latest snapshot per
     * conversation. No-op (returns false) when the conversation is unknown or
     * [transform] leaves the preferences unchanged.
     */
    private suspend fun updatePreferencesOptimistic(
        id: String,
        transform: (ApiConversationPreferences) -> ApiConversationPreferences,
    ): Boolean {
        val snapshot = database.withTransaction {
            val row = conversationDao.find(id) ?: return@withTransaction null
            val conversation = MeeshyApi.json.decodeFromString<ApiConversation>(row.payload)
            val current = conversation.resolvedPreferences ?: ApiConversationPreferences()
            val next = transform(current)
            if (next == current) return@withTransaction null
            conversationDao.upsertAll(
                listOf(
                    row.copy(
                        payload = MeeshyApi.json.encodeToString(conversation.copy(preferences = next)),
                    ),
                ),
            )
            next
        } ?: return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.UPDATE_CONVERSATION_PREFS,
                lane = OutboxLanes.CONVERSATION_PREFS,
                targetId = id,
                payload = MeeshyApi.json.encodeToString(
                    ConversationPrefsPayload(
                        isPinned = snapshot.isPinned,
                        isMuted = snapshot.isMuted,
                        isArchived = snapshot.isArchived,
                        mentionsOnly = snapshot.mentionsOnly,
                    ),
                ),
            ),
        )
        return true
    }
}
