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
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageEffectsEncoder
import me.meeshy.sdk.model.AttachmentAudioTranslationMerge
import me.meeshy.sdk.model.AttachmentTranscriptionMerge
import me.meeshy.sdk.model.MessageTranslationMerge
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.rawApiCall
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.PinPayload
import me.meeshy.sdk.outbox.ReactionPayload
import me.meeshy.sdk.util.isoToEpochMillis
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MessageRepository @Inject constructor(
    private val messageApi: MessageApi,
    private val translationApi: TranslationApi,
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
            messageDao.upsertAll(page.map { it.toCachedEntity(now) })
        }
        return response.pagination?.hasMore ?: (page.size >= pageSize)
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
        forwardedFromId: String? = null,
        forwardedFromConversationId: String? = null,
        effects: MessageEffects = MessageEffects(),
        messageType: String = "text",
        attachmentUploadCmids: List<String> = emptyList(),
        attachments: List<ApiMessageAttachment> = emptyList(),
    ): String {
        val cmid = OutboxIds.cmid()
        val now = clock.nowMillis()
        val wire = MessageEffectsEncoder.encode(effects, Instant.ofEpochMilli(now))
        // A queued send references each prerequisite upload by its cmid until the
        // drainer grafts the real gateway id in (MessageMediaWriteBack); an empty
        // list keeps a text-only send exactly as before (null attachmentIds).
        val placeholderIds = attachmentUploadCmids.filter { it.isNotBlank() }.distinct()
        val optimistic = ApiMessage(
            id = cmid,
            conversationId = conversationId,
            senderId = sender.id,
            content = content,
            messageType = messageType,
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
            clientMessageId = cmid,
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
            messageDao.upsertAll(listOf(optimistic.toLocalEntity(now, LocalSendState.SENDING)))
        }
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.SEND_MESSAGE,
                lane = OutboxLanes.forMessage(conversationId),
                targetId = conversationId,
                payload = MeeshyApi.json.encodeToString(request),
                dependsOn = placeholderIds.toSet(),
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
     * Applies a `message:translated` / `message:translation` socket update to the
     * cache — the translated content is upserted into the message's translations so
     * the Prisme renders it live (progressive translation). No outbox: this is
     * inbound server truth, never a local mutation. A no-op merge (blank, duplicate,
     * or deleted target) leaves the cached row untouched.
     */
    suspend fun applyTranslation(messageId: String, targetLanguage: String, translatedContent: String) {
        updateCachedMessage(messageId, requireSynced = false) { message ->
            MessageTranslationMerge.mergeTranslation(message, targetLanguage, translatedContent) ?: message
        }
    }

    /**
     * Applies a `transcription:ready` socket update to the cache — the transcription
     * is upserted onto the matching audio attachment so the Prisme renders it live
     * (progressive transcription). No outbox: this is inbound server truth, never a
     * local mutation. A no-op merge (blank, duplicate, no target, or deleted) leaves
     * the cached row untouched.
     */
    suspend fun applyTranscription(
        messageId: String,
        attachmentId: String?,
        text: String,
        language: String?,
        confidence: Double?,
        durationMs: Long?,
    ) {
        updateCachedMessage(messageId, requireSynced = false) { message ->
            AttachmentTranscriptionMerge.mergeTranscription(
                message,
                attachmentId,
                text,
                language,
                confidence,
                durationMs,
            ) ?: message
        }
    }

    /**
     * Applies an `audio:translation-ready` socket update to the cache — the cloned-voice
     * translation is upserted onto the matching audio attachment so the open bubble can
     * play the viewer's-language voice live (progressive voice translation). No outbox:
     * this is inbound server truth, never a local mutation. A no-op merge (blank url,
     * blank language, duplicate, no target, or deleted) leaves the cached row untouched.
     */
    suspend fun applyAudioTranslation(
        messageId: String,
        attachmentId: String?,
        language: String,
        url: String,
        transcription: String,
        durationMs: Long?,
        format: String?,
        cloned: Boolean,
        quality: Double?,
        voiceModelId: String?,
        ttsModel: String?,
    ) {
        updateCachedMessage(messageId, requireSynced = false) { message ->
            AttachmentAudioTranslationMerge.mergeAudioTranslation(
                message,
                attachmentId,
                language,
                url,
                transcription,
                durationMs,
                format,
                cloned,
                quality,
                voiceModelId,
                ttsModel,
            ) ?: message
        }
    }

    /**
     * On-demand translation (Prisme, pull side): the viewer tapped a configured
     * language the message has no content for yet. Blocking-translates the
     * message's original text into [targetLanguage] and upserts the result into
     * the cache via [MessageTranslationMerge] so the open bubble can switch to it
     * — the same live re-render path as an inbound `message:translated`. No outbox:
     * a translation is derived server truth, never a local mutation to replay.
     *
     * Returns `true` only when a non-blank translation was actually stored. Inert
     * (`false`, nothing stored) when the message is unknown, deleted, has no source
     * text, the target is blank, the network call fails, the translator returns a
     * blank string, or the translation already matches what is cached (idempotent).
     */
    suspend fun requestTranslation(messageId: String, targetLanguage: String): Boolean {
        val target = targetLanguage.trim()
        if (target.isEmpty()) return false
        val message = cachedMessage(messageId) ?: return false
        if (message.deletedAt != null) return false
        val source = message.content
        if (source.isBlank()) return false

        val translated = when (
            val result = apiCall {
                translationApi.translate(
                    TranslateRequest(
                        text = source,
                        sourceLanguage = message.originalLanguage?.trim().orEmpty(),
                        targetLanguage = target,
                    ),
                )
            }
        ) {
            is NetworkResult.Success -> result.data.translatedText
            is NetworkResult.Failure -> return false
        }
        if (translated.isBlank()) return false

        var stored = false
        updateCachedMessage(messageId, requireSynced = false) { current ->
            val merged = MessageTranslationMerge.mergeTranslation(current, target, translated)
            if (merged != null) {
                stored = true
                merged
            } else {
                current
            }
        }
        return stored
    }

    private suspend fun cachedMessage(messageId: String): ApiMessage? {
        val row = messageDao.find(messageId) ?: return null
        return MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
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

    /**
     * Optimistic pin/unpin of a server-acked message: the cached `pinnedAt` flips
     * instantly (set to now on pin, cleared on unpin — the pinned-banner reads it
     * live) and a `PIN_MESSAGE`/`UNPIN_MESSAGE` mutation is queued on the shared
     * pin lane (a quick pin+unpin of the same message annihilates in the
     * coalescer). Only server-acked messages can be pinned — the gateway does not
     * know an optimistic `cmid` yet — so an unsent bubble is refused (returns
     * false). `pinnedBy` is left untouched optimistically; the authoritative
     * `pinnedBy` arrives with the `message:pinned` socket refresh.
     */
    suspend fun setPinnedOptimistic(messageId: String, pin: Boolean): Boolean {
        val updated = updateCachedMessage(messageId, requireSynced = true) { message ->
            message.copy(pinnedAt = if (pin) Instant.ofEpochMilli(clock.nowMillis()).toString() else null)
        } ?: return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = if (pin) OutboxKind.PIN_MESSAGE else OutboxKind.UNPIN_MESSAGE,
                lane = OutboxLanes.PIN,
                targetId = messageId,
                payload = MeeshyApi.json.encodeToString(PinPayload(updated.conversationId)),
            ),
        )
        return true
    }

    /**
     * Applies a `read-status:updated` receipt to the conversation's cached
     * messages. Mirrors iOS ConversationSyncEngine.applyReadReceipt: only own,
     * server-acked messages at or before the frontier move, and only upward —
     * the gateway summary is an authoritative recount, never a downgrade.
     */
    suspend fun applyReadReceipt(
        conversationId: String,
        ownSenderId: String,
        deliveredCount: Int,
        readCount: Int,
        frontierIso: String?,
    ) {
        val incomingRank = deliveryRank(deliveredCount, readCount, readByAllAt = null)
        if (incomingRank == RANK_SENT) return
        val frontier = frontierIso?.let(::isoToEpochMillis) ?: Long.MAX_VALUE
        database.withTransaction {
            val upgraded = messageDao.listForConversation(conversationId).mapNotNull { row ->
                if (row.sendState != null || row.createdAt > frontier) return@mapNotNull null
                val message = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
                if (message.senderId != ownSenderId) return@mapNotNull null
                if (deliveryRank(message.deliveredCount, message.readCount, message.readByAllAt) >= incomingRank) {
                    return@mapNotNull null
                }
                row.copy(
                    payload = MeeshyApi.json.encodeToString(
                        message.copy(deliveredCount = deliveredCount, readCount = readCount),
                    ),
                )
            }
            if (upgraded.isNotEmpty()) messageDao.upsertAll(upgraded)
        }
    }

    private fun deliveryRank(deliveredCount: Int, readCount: Int, readByAllAt: String?): Int = when {
        readByAllAt != null || readCount > 0 -> RANK_READ
        deliveredCount > 0 -> RANK_DELIVERED
        else -> RANK_SENT
    }

    private suspend fun updateCachedMessage(
        messageId: String,
        requireSynced: Boolean,
        transform: (ApiMessage) -> ApiMessage,
    ): ApiMessage? = database.withTransaction {
        val row = messageDao.find(messageId) ?: return@withTransaction null
        if (requireSynced && row.sendState != null) return@withTransaction null
        val current = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
        val updated = transform(current)
        // A transform that returns its input unchanged (an inert socket update, e.g.
        // a duplicate translation) skips the redundant Room write + re-encode.
        if (updated !== current) {
            messageDao.upsertAll(listOf(row.copy(payload = MeeshyApi.json.encodeToString(updated))))
        }
        updated
    }

    private fun Map<String, Int>?.shifted(emoji: String, delta: Int): Map<String, Int>? {
        val next = (this ?: emptyMap()) + (emoji to ((this?.get(emoji) ?: 0) + delta))
        return next.filterValues { it > 0 }.ifEmpty { null }
    }

    private fun ApiMessage.toLocalEntity(now: Long, state: LocalSendState): MessageEntity =
        toCachedEntity(now).copy(sendState = state.name)

    private fun ApiMessage.toCachedEntity(now: Long): MessageEntity =
        MessageEntity(
            id = id,
            conversationId = conversationId,
            seq = null,
            payload = MeeshyApi.json.encodeToString(this),
            createdAt = isoToEpochMillis(createdAt),
            cachedAt = now,
        )

    private companion object {
        const val OLDER_PAGE_SIZE = 30
        const val RANK_SENT = 0
        const val RANK_DELIVERED = 1
        const val RANK_READ = 2
    }

    private fun cacheSource(conversationId: String) = MessageCacheSource(
        conversationId = conversationId,
        database = database,
        messageDao = messageDao,
        syncMetaDao = syncMetaDao,
        messageApi = messageApi,
        clock = clock,
    )
}
