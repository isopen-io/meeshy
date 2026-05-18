package me.meeshy.sdk.friend

import me.meeshy.sdk.model.EmailInvitationRequest
import me.meeshy.sdk.model.EmailInvitationResponse
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.RespondFriendRequest
import me.meeshy.sdk.model.SendFriendRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.FriendApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Friend requests and email invitations — port of FriendService (FriendService.swift). */
@Singleton
class FriendRepository @Inject constructor(
    private val friendApi: FriendApi,
) {
    suspend fun sendFriendRequest(
        receiverId: String,
        message: String? = null,
    ): NetworkResult<FriendRequest> =
        apiCall { friendApi.sendFriendRequest(SendFriendRequest(receiverId, message)) }

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
