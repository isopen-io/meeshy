package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxRepository

/**
 * The messages of a conversation, offline-first (ARCHITECTURE.md §4, §5): Room is the single
 * source, every mutation is optimistic and rides the outbox.
 *
 * A facade — every member delegates to the one collaborator that owns its domain, so the
 * offline work evolves one domain at a time:
 *  - [MessageHistoryReader] — the cache-first stream, refresh, peek and backwards pagination;
 *  - [MessageSendCoordinator] — the optimistic send, its ACK reconciliation, failure and retry;
 *  - [MessageMutationWriter] — optimistic reactions, edit, delete and pin;
 *  - [MessageEnrichmentWriter] — translations, transcriptions and audio translations;
 *  - [MessageReceiptWriter] — delivery and read receipts.
 */
@Singleton
class MessageRepository internal constructor(
    private val history: MessageHistoryReader,
    private val sends: MessageSendCoordinator,
    private val mutations: MessageMutationWriter,
    private val enrichment: MessageEnrichmentWriter,
    private val receipts: MessageReceiptWriter,
) {
    @Inject
    constructor(
        messageApi: MessageApi,
        translationApi: TranslationApi,
        database: MeeshyDatabase,
        messageDao: MessageDao,
        syncMetaDao: SyncMetaDao,
        outboxRepository: OutboxRepository,
        clock: CacheClock,
    ) : this(
        history = MessageHistoryReader(messageApi, database, messageDao, syncMetaDao, clock),
        sends = MessageSendCoordinator(database, messageDao, outboxRepository, clock),
        mutations = MessageMutationWriter(CachedMessageUpdater(database, messageDao), outboxRepository, clock),
        enrichment = MessageEnrichmentWriter(CachedMessageUpdater(database, messageDao), translationApi),
        receipts = MessageReceiptWriter(database, messageDao),
    )

    /**
     * Cache-first message list for a conversation (ARCHITECTURE.md §4): the
     * cached messages (including optimistic local rows) are served immediately
     * and revalidated in the background.
     */
    fun messagesStream(
        conversationId: String,
        policy: CachePolicy = CachePolicy.Default,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<LocalMessage>>> = history.messagesStream(conversationId, policy, onSyncError)

    /** Explicit refresh of a conversation's messages (pull / retry). Throws on failure. */
    suspend fun refresh(conversationId: String) = history.refresh(conversationId)

    /**
     * Cache-only read of a conversation's [limit] most recent messages, oldest first — a "peek"
     * surface that renders instantly, without a network round-trip or a background revalidate.
     */
    suspend fun recentMessages(
        conversationId: String,
        limit: Int = MessageHistoryReader.PREVIEW_LIMIT,
    ): List<LocalMessage> = history.recentMessages(conversationId, limit)

    /**
     * Backwards pagination: appends the page of messages older than the oldest cached server row
     * to the Room cache. Returns whether more history remains.
     */
    suspend fun loadOlder(
        conversationId: String,
        pageSize: Int = MessageHistoryReader.OLDER_PAGE_SIZE,
    ): Boolean = history.loadOlder(conversationId, pageSize)

    /**
     * Optimistic send: the message appears instantly as a `SENDING` bubble and a `SEND_MESSAGE`
     * mutation is queued on the conversation's FIFO outbox lane. Returns the bubble's `cid_`
     * id (never a `cmid_`, #4624 — see [MessageSendCoordinator.sendOptimistic]).
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
    ): String = sends.sendOptimistic(
        conversationId = conversationId,
        content = content,
        originalLanguage = originalLanguage,
        sender = sender,
        replyToId = replyToId,
        storyReplyToId = storyReplyToId,
        forwardedFromId = forwardedFromId,
        forwardedFromConversationId = forwardedFromConversationId,
        effects = effects,
        messageType = messageType,
        attachmentUploadCmids = attachmentUploadCmids,
        attachments = attachments,
    )

    /**
     * Server ACK for an optimistic send: atomically replaces the local `cmid`
     * row with the authoritative server message — no flicker, no duplicate.
     */
    suspend fun reconcileSent(cmid: String, serverMessage: ApiMessage) =
        sends.reconcileSent(cmid, serverMessage)

    /** The outbox exhausted its retries — surface the bubble as retryable. */
    suspend fun markSendFailed(cmid: String) = sends.markSendFailed(cmid)

    /** User-initiated retry of a failed bubble: back to `SENDING`, its outbox row revived. */
    suspend fun retrySend(cmid: String) = sends.retrySend(cmid)

    /**
     * Optimistic reaction toggle on a server-acked message: the cached `reactionSummary` moves
     * instantly and an `ADD_REACTION`/`REMOVE_REACTION` mutation is queued. Returns whether the
     * toggle was applied.
     */
    suspend fun toggleReactionOptimistic(messageId: String, emoji: String, isAdding: Boolean): Boolean =
        mutations.toggleReactionOptimistic(messageId, emoji, isAdding)

    /** Applies a `message:edited` frame (the full server message) to the cached row. */
    suspend fun applyServerEdit(message: ApiMessage): Boolean = mutations.applyServerEdit(message)

    /** Applies a socket-driven reaction delta to the cache — no outbox involved. */
    suspend fun applyReactionDelta(messageId: String, emoji: String, delta: Int) =
        mutations.applyReactionDelta(messageId, emoji, delta)

    /**
     * Applies a `message:translation` socket update to the cache so the Prisme renders it live.
     * A no-op merge leaves the cached row untouched.
     */
    suspend fun applyTranslation(messageId: String, targetLanguage: String, translatedContent: String) =
        enrichment.applyTranslation(messageId, targetLanguage, translatedContent)

    /**
     * Applies a `transcription:ready` socket update to the matching audio attachment of the
     * cached message. A no-op merge leaves the cached row untouched.
     */
    suspend fun applyTranscription(
        messageId: String,
        attachmentId: String?,
        text: String,
        language: String?,
        confidence: Double?,
        durationMs: Long?,
    ) = enrichment.applyTranscription(messageId, attachmentId, text, language, confidence, durationMs)

    /**
     * Applies an `audio:translation-ready` socket update (the cloned-voice translation) to the
     * matching audio attachment of the cached message. A no-op merge leaves the row untouched.
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
    ) = enrichment.applyAudioTranslation(
        messageId,
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
    )

    /**
     * On-demand translation (Prisme, pull side): translates the message's original text into
     * [targetLanguage] and stores it in the cache. Returns `true` only when a non-blank
     * translation was actually stored; inert (`false`) on any unknown, deleted, blank or failing
     * case, and idempotent.
     */
    suspend fun requestTranslation(messageId: String, targetLanguage: String): Boolean =
        enrichment.requestTranslation(messageId, targetLanguage)

    /**
     * Optimistic edit of a server-acked message: the cached content flips instantly, stale
     * translations are purged, and an `EDIT_MESSAGE` mutation joins the conversation's FIFO lane.
     */
    suspend fun editOptimistic(messageId: String, content: String): Boolean =
        mutations.editOptimistic(messageId, content)

    /**
     * Optimistic delete: the cached message becomes a tombstone (content and translations wiped)
     * and a `DELETE_MESSAGE` mutation joins the conversation's FIFO lane.
     */
    suspend fun deleteOptimistic(messageId: String): Boolean = mutations.deleteOptimistic(messageId)

    /**
     * Optimistic pin/unpin of a server-acked message: the cached `pinnedAt` flips instantly and a
     * `PIN_MESSAGE`/`UNPIN_MESSAGE` mutation is queued on the shared pin lane.
     */
    suspend fun setPinnedOptimistic(messageId: String, pin: Boolean): Boolean =
        mutations.setPinnedOptimistic(messageId, pin)

    /**
     * Applies a `read-status:updated` receipt to the conversation's cached messages: only own,
     * server-acked messages at or before the frontier move, and only upward.
     */
    suspend fun applyReadReceipt(
        conversationId: String,
        ownSenderId: String,
        deliveredCount: Int,
        readCount: Int,
        frontierIso: String?,
    ) = receipts.applyReadReceipt(conversationId, ownSenderId, deliveredCount, readCount, frontierIso)
}
