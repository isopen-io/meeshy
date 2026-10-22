package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendRequestDelivery
import me.meeshy.sdk.friend.FriendRequestSend
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.outbox.FriendRequestPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import javax.inject.Inject

/**
 * `BLOCK_USER`: blocks the user. An exhausted block rolls the optimistic flip back so the
 * blocklist re-hydrates truthfully on next load.
 */
public class BlockUserHandler @Inject constructor(
    private val blockRepository: BlockRepository,
    private val blockCache: BlockCache,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        blockRepository.deliverBlock(row.targetId).toSendResult()

    override suspend fun onExhausted(row: OutboxEntity) {
        blockCache.setBlocked(row.targetId, blocked = false)
    }
}

/** `UNBLOCK_USER`: unblocks the user; an exhausted unblock rolls back to blocked. */
public class UnblockUserHandler @Inject constructor(
    private val blockRepository: BlockRepository,
    private val blockCache: BlockCache,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        blockRepository.deliverUnblock(row.targetId).toSendResult()

    override suspend fun onExhausted(row: OutboxEntity) {
        blockCache.setBlocked(row.targetId, blocked = true)
    }
}

/**
 * `SEND_FRIEND_REQUEST`: sends the request and grafts the real request id over the
 * optimistic placeholder so a later cancel or accept targets the true request. An already
 * existing request is an idempotent success; a rejected one is permanent. An exhausted
 * request rolls the optimistic pending entry back so the connect button re-offers.
 */
public class SendFriendRequestHandler @Inject constructor(
    private val friendRepository: FriendRepository,
    private val friendshipCache: FriendshipCache,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<FriendRequestPayload>(row) { payload ->
            val result = friendRepository.sendFriendRequest(row.targetId, payload.message)
            when (val delivery = FriendRequestSend.classify(result)) {
                is FriendRequestDelivery.Delivered -> {
                    friendshipCache.didSendRequest(row.targetId, delivery.requestId)
                    SendResult.Success
                }
                FriendRequestDelivery.AlreadyExists -> SendResult.Success
                FriendRequestDelivery.Retry -> SendResult.TransientFailure
                is FriendRequestDelivery.Rejected -> SendResult.PermanentFailure(delivery.reason)
            }
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        friendshipCache.rollbackSendRequest(row.targetId)
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface FriendBlockSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.BLOCK_USER)
    public fun blockUser(handler: BlockUserHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UNBLOCK_USER)
    public fun unblockUser(handler: UnblockUserHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.SEND_FRIEND_REQUEST)
    public fun sendFriendRequest(handler: SendFriendRequestHandler): OutboxKindHandler
}
