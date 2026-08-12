package me.meeshy.sdk.friend

import me.meeshy.sdk.model.EmailInvitationRequest
import me.meeshy.sdk.model.EmailInvitationResponse
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.RespondFriendRequest
import me.meeshy.sdk.model.SendFriendRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.FriendApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.FriendRequestPayload
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import kotlinx.serialization.encodeToString
import javax.inject.Inject
import javax.inject.Singleton

/** Friend requests and email invitations — port of FriendService (FriendService.swift). */
@Singleton
class FriendRepository @Inject constructor(
    private val friendApi: FriendApi,
    private val outboxRepository: OutboxRepository,
) {
    suspend fun sendFriendRequest(
        receiverId: String,
        message: String? = null,
    ): NetworkResult<FriendRequest> =
        apiCall { friendApi.sendFriendRequest(SendFriendRequest(receiverId, message)) }

    /**
     * Queues a friend-request send durably (ARCHITECTURE.md §5; ADR-006) instead
     * of an online-first REST call a dropped connection would silently lose. This
     * only enqueues; the caller flips the [FriendshipCache] optimistically **after**
     * a non-`null` return, keyed by the returned `cmid` as a placeholder request id,
     * so the shared cache never shows a pending with no durable row behind it. The
     * `OutboxFlushWorker` then delivers the row, grafting the real request id back on
     * success and rolling the pending back on a hard exhaust. The coalescer collapses
     * a repeated send to the same receiver. A blank receiver is inert (returns
     * `null`, nothing queued). Surpasses iOS, whose friend-request send is online-only.
     *
     * @return the queued row's `cmid`, or `null` for a blank receiver.
     */
    suspend fun enqueueSendFriendRequest(
        receiverId: String,
        cmid: String = OutboxIds.cmid(),
        message: String? = null,
    ): String? {
        if (receiverId.isBlank()) return null
        return outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.SEND_FRIEND_REQUEST,
                lane = OutboxLanes.FRIEND,
                targetId = receiverId,
                payload = MeeshyApi.json.encodeToString(FriendRequestPayload(message)),
                cmid = cmid,
            ),
        )
    }

    suspend fun receivedRequests(
        offset: Int = 0,
        limit: Int = 20,
    ): NetworkResult<List<FriendRequest>> =
        apiCall { friendApi.receivedRequests(offset, limit) }

    suspend fun sentRequests(
        offset: Int = 0,
        limit: Int = 20,
    ): NetworkResult<List<FriendRequest>> =
        apiCall { friendApi.sentRequests(offset, limit) }

    suspend fun respond(requestId: String, accepted: Boolean): NetworkResult<FriendRequest> =
        apiCall {
            friendApi.respond(
                requestId,
                RespondFriendRequest(status = if (accepted) "accepted" else "rejected"),
            )
        }

    suspend fun deleteRequest(requestId: String): NetworkResult<Unit> =
        apiCall { friendApi.deleteRequest(requestId) }

    suspend fun sendEmailInvitation(email: String): NetworkResult<EmailInvitationResponse> =
        apiCall { friendApi.sendEmailInvitation(EmailInvitationRequest(email)) }
}
