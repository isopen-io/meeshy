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
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.ReactionPayload
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

    /**
     * Optimistic reaction toggle: the cached `reactionSummary` moves instantly
     * and an `ADD_REACTION`/`REMOVE_REACTION` mutation is queued on the shared
     * reaction lane (a quick add+remove annihilates in the coalescer). Only
     * server-acked messages can be reacted to — the gateway does not know an
     * optimistic `cmid` yet. Returns whether the toggle was applied.
     */
    suspend fun toggleReactionOptimistic(messageId: String, emoji: String, isAdding: Boolean): Boolean {
        updateCachedMessage(messageId, requireSynced = true) { message ->
            message.copy(reactionSummary = message.reactionSummary.shifted(emoji, if (isAdding) 1 else -1))
        } ?: return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = if (isAdding) OutboxKind.ADD_REACTION else OutboxKind.REMOVE_REACTION,
                lane = OutboxLanes.REACTION,
                targetId = messageId,
                payload = MeeshyApi.json.encodeToString(ReactionPayload(emoji)),
            ),
        )
        return true
    }

    /** Applies a socket-driven reaction delta to the cache — no outbox involved. */
    suspend fun applyReactionDelta(messageId: String, emoji: String, delta: Int) {
        updateCachedMessage(messageId, requireSynced = false) { message ->
            message.copy(reactionSummary = message.reactionSummary.shifted(emoji, delta))
        }
    }

    /**
     * Optimistic edit of a server-acked message: the cached content flips
     * instantly, stale translations are purged (the Prisme must never show a
     * translation of the old text — the retranslation arrives over the socket),
     * and an `EDIT_MESSAGE` mutation joins the conversation's FIFO lane.
     */
    suspend fun editOptimistic(messageId: String, content: String): Boolean {
        val updated = updateCachedMessage(messageId, requireSynced = true) { message ->
            message.copy(content = content, isEdited = true, translations = emptyList())
        } ?: return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.EDIT_MESSAGE,
                lane = OutboxLanes.forMessage(updated.conversationId),
                targetId = messageId,
                payload = MeeshyApi.json.encodeToString(EditMessageRequest(content)),
            ),
        )
        return true
    }

    /**
     * Optimistic delete: the cached message becomes a tombstone (content and
     * translations wiped — retention is a security invariant, ARCHITECTURE.md
     * §18) and a `DELETE_MESSAGE` mutation joins the conversation's FIFO lane.
     */
    suspend fun deleteOptimistic(messageId: String): Boolean {
        val updated = updateCachedMessage(messageId, requireSynced = true) { message ->
            message.copy(
                content = "",
                translations = emptyList(),
                deletedAt = Instant.ofEpochMilli(clock.nowMillis()).toString(),
            )
        } ?: return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.DELETE_MESSAGE,
                lane = OutboxLanes.forMessage(updated.conversationId),
                targetId = messageId,
                payload = "{}",
            ),
        )
        return true
    }

    private suspend fun updateCachedMessage(
        messageId: String,
        requireSynced: Boolean,
        transform: (ApiMessage) -> ApiMessage,
    ): ApiMessage? = database.withTransaction {
        val row = messageDao.find(messageId) ?: return@withTransaction null
        if (requireSynced && row.sendState != null) return@withTransaction null
        val updated = transform(MeeshyApi.json.decodeFromString<ApiMessage>(row.payload))
        messageDao.upsertAll(listOf(row.copy(payload = MeeshyApi.json.encodeToString(updated))))
        updated
    }

    private fun Map<String, Int>?.shifted(emoji: String, delta: Int): Map<String, Int>? {
        val next = (this ?: emptyMap()) + (emoji to ((this?.get(emoji) ?: 0) + delta))
        return next.filterValues { it > 0 }.ifEmpty { null }
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
