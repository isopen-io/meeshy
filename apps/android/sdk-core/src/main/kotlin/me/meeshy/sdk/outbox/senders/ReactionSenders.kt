package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.net.api.AddReactionRequest
import me.meeshy.sdk.net.api.ReactionApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.ReactionPayload
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import javax.inject.Inject

/**
 * `ADD_REACTION`: reacts to the row's message with the payload's emoji. An exhausted reaction (refused in clear for an
 * end-to-end conversation, #13790, or retries spent) takes its optimistic chip back.
 */
public class AddReactionHandler @Inject constructor(
    private val reactionApi: ReactionApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
    private val ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ReactionPayload>(row) { body ->
            apiCall {
                reactionApi.add(AddReactionRequest(messageId = row.targetId, emoji = body.emoji))
            }.toSendResult(body.conversationId, ledger)
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        undoReaction(json, messageRepository, row, delta = -1)
    }
}

/** `REMOVE_REACTION`: removes the payload's emoji from the row's message; an exhausted removal puts the chip back. */
public class RemoveReactionHandler @Inject constructor(
    private val reactionApi: ReactionApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
    private val ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ReactionPayload>(row) { body ->
            apiCall { reactionApi.remove(row.targetId, body.emoji) }.toSendResult(body.conversationId, ledger)
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        undoReaction(json, messageRepository, row, delta = 1)
    }
}

/** The opposite of the optimistic shift the toggle applied to the cached summary; an unreadable payload undoes nothing. */
private suspend fun undoReaction(json: Json, messageRepository: MessageRepository, row: OutboxEntity, delta: Int) {
    val emoji = runCatching { json.decodeFromString<ReactionPayload>(row.payload) }.getOrNull()?.emoji ?: return
    messageRepository.applyReactionDelta(row.targetId, emoji, delta)
}

@Module
@InstallIn(SingletonComponent::class)
public interface ReactionSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.ADD_REACTION)
    public fun addReaction(handler: AddReactionHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.REMOVE_REACTION)
    public fun removeReaction(handler: RemoveReactionHandler): OutboxKindHandler
}
