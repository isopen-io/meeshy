package me.meeshy.sdk.conversation

import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.util.isoToEpochMillis
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

    suspend fun upsertFromSocket(message: ApiMessage) {
        val now = SystemCacheClock.nowMillis()
        val row = MessageEntity(
            id = message.id,
            conversationId = message.conversationId,
            seq = null,
            payload = MeeshyApi.json.encodeToString(message),
            createdAt = isoToEpochMillis(message.createdAt),
            cachedAt = now,
        )
        messageDao.upsertAll(listOf(row))
    }

    suspend fun markDeleted(messageId: String, deletedAt: String?) {
        val existing = messageDao.findById(messageId) ?: return
        val parsed = MeeshyApi.json.decodeFromString<ApiMessage>(existing.payload)
        val updated = parsed.copy(deletedAt = deletedAt)
        val row = existing.copy(payload = MeeshyApi.json.encodeToString(updated), cachedAt = SystemCacheClock.nowMillis())
        messageDao.upsertAll(listOf(row))
    }

    suspend fun updateReactions(messageId: String, emoji: String, delta: Int) {
        val existing = messageDao.findById(messageId) ?: return
        val parsed = MeeshyApi.json.decodeFromString<ApiMessage>(existing.payload)
        val currentCount = parsed.reactionSummary?.get(emoji) ?: 0
        val newCount = maxOf(0, currentCount + delta)
        val updatedSummary = (parsed.reactionSummary ?: emptyMap()).toMutableMap().apply {
            if (newCount == 0) remove(emoji) else put(emoji, newCount)
        }
        val updated = parsed.copy(reactionSummary = updatedSummary)
        val row = existing.copy(payload = MeeshyApi.json.encodeToString(updated), cachedAt = SystemCacheClock.nowMillis())
        messageDao.upsertAll(listOf(row))
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
