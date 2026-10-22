package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendRequestResponse
import me.meeshy.sdk.friend.FriendRequestResponseDelivery
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequestAction
import me.meeshy.sdk.outbox.FriendRespondPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.withPayload
import timber.log.Timber
import javax.inject.Inject

/**
 * `RESPOND_FRIEND_REQUEST`: delivers an accept / reject queued while offline. A vanished
 * request (404) is abandoned without retry and the optimistic effect is undone so the
 * caches realign; an exhausted row restores the received-pending entry (and, for an
 * accept, removes the friend injected into the persisted roster).
 */
public class RespondFriendRequestHandler @Inject constructor(
    private val friendRepository: FriendRepository,
    private val friendshipCache: FriendshipCache,
    private val friendListRepository: FriendListRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<FriendRespondPayload>(row) { payload -> deliver(row, payload) }

    private suspend fun deliver(row: OutboxEntity, payload: FriendRespondPayload): SendResult {
        val accepted = payload.action == FriendRequestAction.Accept.wire
        val result = friendRepository.respond(row.targetId, accepted)
        return when (val delivery = FriendRequestResponse.classify(result)) {
            FriendRequestResponseDelivery.Delivered -> SendResult.Success
            FriendRequestResponseDelivery.Gone -> {
                realignAfterGone(payload, accepted)
                SendResult.Success
            }
            FriendRequestResponseDelivery.Retry -> SendResult.TransientFailure
            is FriendRequestResponseDelivery.Rejected -> SendResult.PermanentFailure(delivery.reason)
        }
    }

    private suspend fun realignAfterGone(payload: FriendRespondPayload, accepted: Boolean) {
        if (!accepted) return
        friendshipCache.didRemoveFriend(payload.userId)
        removeFromRoster(payload.userId)
    }

    override suspend fun onExhausted(row: OutboxEntity) {
        val payload = runCatching { json.decodeFromString<FriendRespondPayload>(row.payload) }
            .getOrElse { return }
        if (payload.action == FriendRequestAction.Accept.wire) {
            friendshipCache.rollbackAccept(payload.userId, row.targetId)
            removeFromRoster(payload.userId)
        } else {
            friendshipCache.rollbackReject(payload.userId, row.targetId)
        }
    }

    private suspend fun removeFromRoster(userId: String) {
        runCatching { friendListRepository.remove(userId) }
            .onFailure { Timber.w(it, "Friend roster realign failed") }
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface FriendRespondSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.RESPOND_FRIEND_REQUEST)
    public fun respondFriendRequest(handler: RespondFriendRequestHandler): OutboxKindHandler
}
