package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import java.time.Instant
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageEffectsEncoder
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository

/**
 * The send lifecycle of one outgoing message (ARCHITECTURE.md §5): the optimistic `SENDING`
 * bubble and its queued `SEND_MESSAGE`, the server ACK that replaces it, the outbox giving up,
 * and the user's retry. One domain — the local `cid_` row from birth to reconciliation.
 */
internal class MessageSendCoordinator(
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val outboxRepository: OutboxRepository,
    private val clock: CacheClock,
) {

    /**
     * Optimistic send: the message appears instantly as a `SENDING` bubble backed by Room, and a
     * `SEND_MESSAGE` mutation is queued on the conversation's FIFO outbox lane. Returns the
     * bubble's id.
     *
     * **Cet identifiant est un `cid_`, jamais un `cmid_`** (#4624). Il porte QUATRE roles, et ils
     * ne sont pas separables : id de la ligne Room, corps `clientMessageId` envoye au gateway, cle
     * de la ligne d'outbox (que `reconcileSent` reinjecte dans `deleteByIds`) et — le role qui les
     * scelle — identifiant LOCAL par lequel `MessageCacheSource.persist` purge la bulle optimiste,
     * en lisant le `clientMessageId` que le SERVEUR renvoie. Les quatre partagent donc une valeur,
     * et le serveur impose son format : `^cid_<uuid v4 minuscule>` aux trois portes (REST, socket,
     * lien anonyme). `OutboxIds.cmid()` produisait un prefixe que les trois rejetaient en 400 —
     * aucun message ne partait d'Android.
     *
     * Le `cmid` reste la cle des mutations qui ne sont PAS des messages (amis, preferences,
     * televersements de media) : il ne voyage pas sur ce fil-ci.
     */
    suspend fun sendOptimistic(
        conversationId: String,
        content: String,
        originalLanguage: String,
        sender: MeeshyUser,
        replyToId: String? = null,
        storyReplyToId: String? = null,
        forwardedFromId: String? = null,
        forwardedFromConversationId: String? = null,
        effects: MessageEffects = MessageEffects(),
        messageType: String = "text",
        attachmentUploadCmids: List<String> = emptyList(),
        attachments: List<ApiMessageAttachment> = emptyList(),
    ): String {
        val cid = OutboxIds.cid()
        val now = clock.nowMillis()
        val wire = MessageEffectsEncoder.encode(effects, Instant.ofEpochMilli(now))
        // A queued send references each prerequisite upload by its cmid until the
        // drainer grafts the real gateway id in (MessageMediaWriteBack); an empty
        // list keeps a text-only send exactly as before (null attachmentIds).
        val placeholderIds = attachmentUploadCmids.filter { it.isNotBlank() }.distinct()
        val optimistic = ApiMessage(
            id = cid,
            conversationId = conversationId,
            senderId = sender.id,
            content = content,
            messageType = messageType,
            originalLanguage = originalLanguage,
            replyToId = replyToId,
            storyReplyToId = storyReplyToId,
            createdAt = Instant.ofEpochMilli(now).toString(),
            sender = ApiMessageSender(
                userId = sender.id,
                displayName = sender.displayName,
                username = sender.username,
                avatar = sender.avatar,
            ),
            clientMessageId = cid,
            attachments = attachments,
            forwardedFromId = forwardedFromId,
            forwardedFromConversationId = forwardedFromConversationId,
            effectFlags = wire.effectFlags,
            isBlurred = wire.isBlurred,
            isViewOnce = wire.isViewOnce,
            expiresAt = wire.expiresAt,
        )
        val request = SendMessageRequest(
            content = content,
            originalLanguage = originalLanguage,
            messageType = messageType,
            replyToId = replyToId,
            storyReplyToId = storyReplyToId,
            clientMessageId = cid,
            attachmentIds = placeholderIds.ifEmpty { null },
            forwardedFromId = forwardedFromId,
            forwardedFromConversationId = forwardedFromConversationId,
            effectFlags = wire.effectFlags,
            isBlurred = wire.isBlurred,
            isViewOnce = wire.isViewOnce,
            ephemeralDuration = wire.ephemeralDuration,
            expiresAt = wire.expiresAt,
            maxViewOnceCount = wire.maxViewOnceCount,
        )
        database.withTransaction {
            messageDao.upsertAll(listOf(MessageEntityFactory.local(optimistic, now, LocalSendState.SENDING)))
        }
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.SEND_MESSAGE,
                lane = OutboxLanes.forMessage(conversationId),
                targetId = conversationId,
                payload = MeeshyApi.json.encodeToString(request),
                dependsOn = placeholderIds.toSet(),
                cmid = cid,
            ),
        )
        return cid
    }

    /**
     * Server ACK for an optimistic send: atomically replaces the local `cmid`
     * row with the authoritative server message — no flicker, no duplicate.
     */
    suspend fun reconcileSent(cmid: String, serverMessage: ApiMessage) {
        val now = clock.nowMillis()
        database.withTransaction {
            messageDao.deleteByIds(listOf(cmid))
            messageDao.upsertAll(listOf(MessageEntityFactory.cached(serverMessage, now)))
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
                        storyReplyToId = message.storyReplyToId,
                        clientMessageId = cmid,
                        forwardedFromId = message.forwardedFromId,
                        forwardedFromConversationId = message.forwardedFromConversationId,
                        effectFlags = message.effectFlags,
                        isBlurred = message.isBlurred,
                        isViewOnce = message.isViewOnce,
                        expiresAt = message.expiresAt,
                    ),
                ),
                cmid = cmid,
            ),
        )
    }
}
