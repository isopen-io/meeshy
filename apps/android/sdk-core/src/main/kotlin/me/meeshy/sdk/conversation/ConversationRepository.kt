package me.meeshy.sdk.conversation

import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ConversationRepository @Inject constructor(
    private val conversationApi: ConversationApi,
    database: MeeshyDatabase,
    conversationDao: ConversationDao,
    syncMetaDao: SyncMetaDao,
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
}
