package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.conversation.MessageMediaWriteBack
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.OutboxPayloadGraft
import me.meeshy.sdk.outbox.PinPayload
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import javax.inject.Inject

/**
 * `SEND_MESSAGE`: posts the queued message, then reconciles the optimistic bubble with
 * the server copy. An exhausted send flips the bubble to its failed state. It owns the
 * graft that swaps an upload's placeholder `cmid` for the real attachment id.
 */
public class SendMessageHandler @Inject constructor(
    private val messageApi: MessageApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
) : OutboxKindHandler {

    override val payloadGraft: OutboxPayloadGraft = MessageMediaWriteBack::graft

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<SendMessageRequest>(row) { request ->
            when (val result = apiCall { messageApi.send(row.targetId, request) }) {
                is NetworkResult.Success -> {
                    messageRepository.reconcileSent(row.cmid, result.data)
                    SendResult.Success
                }
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        messageRepository.markSendFailed(row.cmid)
    }
}

/** `EDIT_MESSAGE`: patches the message content. */
public class EditMessageHandler @Inject constructor(
    private val messageApi: MessageApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<EditMessageRequest>(row) { body ->
            apiCall { messageApi.edit(row.targetId, body) }.toSendResult()
        }
}

/** `DELETE_MESSAGE`: deletes the message. */
public class DeleteMessageHandler @Inject constructor(
    private val messageApi: MessageApi,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { messageApi.delete(row.targetId) }.toSendResult()
}

/**
 * `PIN_MESSAGE`: pins the message in its conversation. An exhausted pin refreshes the
 * conversation so the optimistic `pinnedAt` flip is reconciled with the server truth.
 */
public class PinMessageHandler @Inject constructor(
    private val messageApi: MessageApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<PinPayload>(row) { payload ->
            apiCall { messageApi.pin(payload.conversationId, row.targetId) }.toSendResult()
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        refreshPinnedConversation(json, messageRepository, row)
    }
}

/** `UNPIN_MESSAGE`: unpins the message; an exhausted unpin reconciles like [PinMessageHandler]. */
public class UnpinMessageHandler @Inject constructor(
    private val messageApi: MessageApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<PinPayload>(row) { payload ->
            apiCall { messageApi.unpin(payload.conversationId, row.targetId) }.toSendResult()
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        refreshPinnedConversation(json, messageRepository, row)
    }
}

private suspend fun refreshPinnedConversation(
    json: Json,
    messageRepository: MessageRepository,
    row: OutboxEntity,
) {
    runCatching { json.decodeFromString<PinPayload>(row.payload) }
        .getOrNull()
        ?.let { messageRepository.refresh(it.conversationId) }
}

@Module
@InstallIn(SingletonComponent::class)
public interface MessageSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.SEND_MESSAGE)
    public fun sendMessage(handler: SendMessageHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.EDIT_MESSAGE)
    public fun editMessage(handler: EditMessageHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.DELETE_MESSAGE)
    public fun deleteMessage(handler: DeleteMessageHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.PIN_MESSAGE)
    public fun pinMessage(handler: PinMessageHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UNPIN_MESSAGE)
    public fun unpinMessage(handler: UnpinMessageHandler): OutboxKindHandler
}
