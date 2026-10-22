package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.ConversationPreferencesUpdate
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.ConversationPrefsPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import javax.inject.Inject

/** `READ_RECEIPT`: marks the row's conversation as read. */
public class ReadReceiptHandler @Inject constructor(
    private val conversationApi: ConversationApi,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { conversationApi.markRead(row.targetId) }.toSendResult()
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
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ConversationPrefsPayload>(row) { prefs ->
            val body = ConversationPreferencesUpdate(
                isPinned = prefs.isPinned,
                isMuted = prefs.isMuted,
                isArchived = prefs.isArchived,
                mentionsOnly = prefs.mentionsOnly,
                categoryId = prefs.categoryId,
                customName = prefs.customName,
                reaction = prefs.reaction,
                tags = prefs.tags,
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
