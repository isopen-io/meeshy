package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.core.database.entity.OutboxEntity
import kotlinx.coroutines.flow.first
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.ConversationPreferencesUpdate
import me.meeshy.sdk.net.api.MarkReadBody
import me.meeshy.sdk.outbox.ReadReceiptPayload
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.ConversationPrefsPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.UserStateRollbackEvents
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import javax.inject.Inject

/** `READ_RECEIPT`: marks the row's conversation as read. */
public class ReadReceiptHandler @Inject constructor(
    private val conversationApi: ConversationApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult {
        val declared = runCatching { json.decodeFromString<ReadReceiptPayload>(row.payload) }.getOrNull()
        val body = declared?.takeIf { it.language != null || it.messageIds != null }?.let {
            MarkReadBody(
                messageIds = it.messageIds,
                language = it.language,
                messageLanguages = it.messageLanguages?.takeIf(Map<String, String>::isNotEmpty),
                caughtUpToMessageId = it.caughtUpToMessageId,
            )
        } ?: return apiCall { conversationApi.markRead(row.targetId) }.toSendResult()
        return apiCall { conversationApi.markReadDeclaring(row.targetId, body) }.toSendResult()
    }
}

/** `MARK_UNREAD`: marks the row's conversation as unread. */
public class MarkUnreadHandler @Inject constructor(
    private val conversationApi: ConversationApi,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { conversationApi.markUnread(row.targetId) }.toSendResult()
}

/** `UPDATE_CONVERSATION_PREFS`: pushes the full per-user preference snapshot. */
public class UpdateConversationPrefsHandler @Inject constructor(
    private val conversationApi: ConversationApi,
    private val json: Json,
    private val conversationRepository: ConversationRepository,
    private val outboxRepository: OutboxRepository,
    private val rollbacks: UserStateRollbackEvents,
) : OutboxKindHandler {

    /**
     * Le serveur a refusé l'instantané (ou les essais sont épuisés) : la ligne retrouve l'état d'avant le geste et
     * l'écran en est prévenu. Un instantané plus récent encore en attente pour la conversation porte l'intention
     * actuelle : il n'est pas défait.
     */
    override suspend fun onExhausted(row: OutboxEntity) {
        val previous = runCatching { json.decodeFromString<ConversationPrefsPayload>(row.payload).previous }.getOrNull() ?: return
        val newerPending = outboxRepository.observePendingTargets(OutboxKind.UPDATE_CONVERSATION_PREFS).first()
        if (row.targetId in newerPending) return
        if (conversationRepository.restorePreferences(row.targetId, previous)) rollbacks.emit(row.targetId)
    }

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ConversationPrefsPayload>(row) { prefs ->
            val body = ConversationPreferencesUpdate(
                isPinned = prefs.isPinned,
                isMuted = prefs.isMuted,
                isArchived = prefs.isArchived,
                mentionsOnly = prefs.mentionsOnly,
                categoryId = when {
                    prefs.categoryId != null -> JsonPrimitive(prefs.categoryId)
                    prefs.clearCategory -> JsonNull
                    else -> null
                },
                customName = prefs.customName,
                reaction = prefs.reaction,
                tags = prefs.tags,
                appearance = prefs.appearance,
            )
            apiCall { conversationApi.updatePreferences(row.targetId, body) }.toSendResult()
        }
}

@Module
@InstallIn(SingletonComponent::class)
public interface ConversationSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.READ_RECEIPT)
    public fun readReceipt(handler: ReadReceiptHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.MARK_UNREAD)
    public fun markUnread(handler: MarkUnreadHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UPDATE_CONVERSATION_PREFS)
    public fun updateConversationPrefs(handler: UpdateConversationPrefsHandler): OutboxKindHandler
}
