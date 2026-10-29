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
import me.meeshy.sdk.reaction.OwnReactionWithdrawal
import me.meeshy.sdk.reaction.OwnReactionWithdrawals
import javax.inject.Inject

/**
 * `ADD_REACTION`: reacts to the row's message with the payload's emoji. An exhausted reaction (refused in clear for an
 * end-to-end conversation, #13790, or retries spent) takes its optimistic chip back, and the viewer's own mark (#13803).
 */
public class AddReactionHandler @Inject constructor(
    private val reactionApi: ReactionApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
    private val ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
    private val withdrawals: OwnReactionWithdrawals,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ReactionPayload>(row) { body ->
            apiCall {
                reactionApi.add(AddReactionRequest(messageId = row.targetId, emoji = body.emoji))
            }.toSendResult(body.conversationId, ledger)
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        undoReaction(json, messageRepository, withdrawals, row, wasAdding = true)
    }
}

/** `REMOVE_REACTION`: removes the payload's emoji from the row's message; an exhausted removal puts the chip back, the viewer's mark too. */
public class RemoveReactionHandler @Inject constructor(
    private val reactionApi: ReactionApi,
    private val messageRepository: MessageRepository,
    private val json: Json,
    private val ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
    private val withdrawals: OwnReactionWithdrawals,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ReactionPayload>(row) { body ->
            apiCall { reactionApi.remove(row.targetId, body.emoji) }.toSendResult(body.conversationId, ledger)
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        undoReaction(json, messageRepository, withdrawals, row, wasAdding = false)
    }
}

/**
 * The opposite of the optimistic shift the toggle applied to the cached summary, and of the viewer's own mark on the open
 * screen (#13803); an unreadable payload undoes nothing.
 */
private suspend fun undoReaction(
    json: Json,
    messageRepository: MessageRepository,
    withdrawals: OwnReactionWithdrawals,
    row: OutboxEntity,
    wasAdding: Boolean,
) {
    val emoji = runCatching { json.decodeFromString<ReactionPayload>(row.payload) }.getOrNull()?.emoji ?: return
    messageRepository.applyReactionDelta(row.targetId, emoji, if (wasAdding) -1 else 1)
    withdrawals.announce(OwnReactionWithdrawal(row.targetId, emoji, stillMine = !wasAdding))
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
