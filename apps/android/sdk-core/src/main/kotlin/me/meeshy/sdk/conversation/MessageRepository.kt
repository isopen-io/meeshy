package me.meeshy.sdk.conversation

import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.apiCall
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MessageRepository @Inject constructor(
    private val messageApi: MessageApi,
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val syncMetaDao: SyncMetaDao,
) {
    /**
     * Cache-first message list for a conversation (ARCHITECTURE.md §4): the
     * cached messages are served immediately and revalidated in the background.
     */
    fun messagesStream(
        conversationId: String,
        policy: CachePolicy = CachePolicy.Default,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<ApiMessage>>> =
        cacheFirstFlow(policy, cacheSource(conversationId), onRevalidateError = onSyncError)

    /** Explicit refresh of a conversation's messages (pull / retry). Throws on failure. */
    suspend fun refresh(conversationId: String) {
        cacheSource(conversationId).revalidate()
    }

    suspend fun send(
        conversationId: String,
        content: String,
        originalLanguage: String,
        replyToId: String? = null,
    ): NetworkResult<ApiMessage> =
        apiCall {
            messageApi.send(
                conversationId,
                SendMessageRequest(
                    content = content,
                    originalLanguage = originalLanguage,
                    replyToId = replyToId,
                    clientMessageId = UUID.randomUUID().toString(),
                ),
            )
        }

    private fun cacheSource(conversationId: String) = MessageCacheSource(
        conversationId = conversationId,
        database = database,
        messageDao = messageDao,
        syncMetaDao = syncMetaDao,
        messageApi = messageApi,
        clock = SystemCacheClock,
    )
}
