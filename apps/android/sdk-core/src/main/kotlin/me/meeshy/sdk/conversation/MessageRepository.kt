package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.util.isoToEpochMillis
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MessageRepository @Inject constructor(
    private val messageApi: MessageApi,
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val syncMetaDao: SyncMetaDao,
    private val outboxRepository: OutboxRepository,
    private val clock: CacheClock,
) {
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
     * Optimistic send (ARCHITECTURE.md §5): the message appears instantly as a
     * `SENDING` bubble backed by Room, and a `SEND_MESSAGE` mutation is queued
     * on the conversation's FIFO outbox lane. Returns the bubble's `cmid`.
     */
    suspend fun sendOptimistic(
        conversationId: String,
        content: String,
        originalLanguage: String,
        sender: MeeshyUser,
        replyToId: String? = null,
    ): String {
        val cmid = OutboxIds.cmid()
        val now = clock.nowMillis()
        val optimistic = ApiMessage(
            id = cmid,
            conversationId = conversationId,
            senderId = sender.id,
            content = content,
            originalLanguage = originalLanguage,
            replyToId = replyToId,
            createdAt = Instant.ofEpochMilli(now).toString(),
            sender = ApiMessageSender(
                userId = sender.id,
                displayName = sender.displayName,
                username = sender.username,
                avatar = sender.avatar,
            ),
            clientMessageId = cmid,
        )
        val request = SendMessageRequest(
            content = content,
            originalLanguage = originalLanguage,
            replyToId = replyToId,
            clientMessageId = cmid,
        )
        database.withTransaction {
            messageDao.upsertAll(listOf(optimistic.toLocalEntity(now, LocalSendState.SENDING)))
        }
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.SEND_MESSAGE,
                lane = OutboxLanes.forMessage(conversationId),
                targetId = conversationId,
                payload = MeeshyApi.json.encodeToString(request),
                cmid = cmid,
            ),
        )
        return cmid
    }

    /**
     * Server ACK for an optimistic send: atomically replaces the local `cmid`
     * row with the authoritative server message — no flicker, no duplicate.
     */
    suspend fun reconcileSent(cmid: String, serverMessage: ApiMessage) {
        val now = clock.nowMillis()
        database.withTransaction {
            messageDao.deleteByIds(listOf(cmid))
            messageDao.upsertAll(
                listOf(
                    MessageEntity(
                        id = serverMessage.id,
                        conversationId = serverMessage.conversationId,
                        seq = null,
                        payload = MeeshyApi.json.encodeToString(serverMessage),
                        createdAt = isoToEpochMillis(serverMessage.createdAt),
                        cachedAt = now,
                    ),
                ),
            )
        }
    }

    /** The outbox exhausted its retries — surface the bubble as retryable. */
    suspend fun markSendFailed(cmid: String) {
        messageDao.updateSendState(cmid, LocalSendState.FAILED.name)
    }

    /**
     * User-initiated retry of a failed bubble: flips it back to `SENDING` and
     * revives its outbox row (or re-enqueues from the cached payload when the
     * row is gone).
     */
    suspend fun retrySend(cmid: String) {
        val row = messageDao.find(cmid) ?: return
        messageDao.updateSendState(cmid, LocalSendState.SENDING.name)
        if (outboxRepository.retry(cmid)) return
        val message = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.SEND_MESSAGE,
                lane = OutboxLanes.forMessage(message.conversationId),
                targetId = message.conversationId,
                payload = MeeshyApi.json.encodeToString(
                    SendMessageRequest(
                        content = message.content,
                        originalLanguage = message.originalLanguage
                            ?: LanguageResolver.FALLBACK_LANGUAGE,
                        replyToId = message.replyToId,
                        clientMessageId = cmid,
                    ),
                ),
                cmid = cmid,
            ),
        )
    }

    private fun ApiMessage.toLocalEntity(now: Long, state: LocalSendState): MessageEntity =
        MessageEntity(
            id = id,
            conversationId = conversationId,
            seq = null,
            payload = MeeshyApi.json.encodeToString(this),
            createdAt = isoToEpochMillis(createdAt),
            cachedAt = now,
            sendState = state.name,
        )

    private fun cacheSource(conversationId: String) = MessageCacheSource(
        conversationId = conversationId,
        database = database,
        messageDao = messageDao,
        syncMetaDao = syncMetaDao,
        messageApi = messageApi,
        clock = clock,
    )
}
