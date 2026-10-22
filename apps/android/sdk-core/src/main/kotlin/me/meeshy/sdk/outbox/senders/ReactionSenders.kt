package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
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

/** `ADD_REACTION`: reacts to the row's message with the payload's emoji. */
public class AddReactionHandler @Inject constructor(
    private val reactionApi: ReactionApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ReactionPayload>(row) { body ->
            apiCall {
                reactionApi.add(AddReactionRequest(messageId = row.targetId, emoji = body.emoji))
            }.toSendResult()
        }
}

/** `REMOVE_REACTION`: removes the payload's emoji from the row's message. */
public class RemoveReactionHandler @Inject constructor(
    private val reactionApi: ReactionApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ReactionPayload>(row) { body ->
            apiCall { reactionApi.remove(row.targetId, body.emoji) }.toSendResult()
        }
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
