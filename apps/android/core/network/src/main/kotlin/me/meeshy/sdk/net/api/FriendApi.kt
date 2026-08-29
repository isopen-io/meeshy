package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.EmailInvitationRequest
import me.meeshy.sdk.model.EmailInvitationResponse
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.RespondFriendRequest
import me.meeshy.sdk.model.SendFriendRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface FriendApi {
    // #4254 — l'adresse CANONIQUE d'envoi (#4162) : elle porte l'union des
    // gardes des deux familles historiques, plus le blocage, qui n'existait
    // dans aucune.
    @POST("directory/friend-requests")
    suspend fun sendFriendRequest(@Body body: SendFriendRequest): ApiResponse<FriendRequest>

    // #4254 — la lecture CANONIQUE, par CURSEUR et dans les DEUX sens.
    // `pagination.nextCursor` est déjà déclaré sur `ApiResponse` (vérifié).
    // Les trois lectures par décalage ci-dessous restent servies jusqu'à ce que
    // `FriendRepository` bascule ; leur `offset` saute des lignes dès qu'une
    // demande est créée pendant la pagination.
    @GET("directory/friend-requests")
    suspend fun friendRequests(
        @Query("direction") direction: String = "received",
        @Query("status") status: String? = null,
        @Query("q") q: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<FriendRequest>>

    @GET("friend-requests/received")
    suspend fun receivedRequests(
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<FriendRequest>>

    @GET("friend-requests/sent")
    suspend fun sentRequests(
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<FriendRequest>>

    @PATCH("friend-requests/{id}")
    suspend fun respond(
        @Path("id") requestId: String,
        @Body body: RespondFriendRequest,
    ): ApiResponse<FriendRequest>

    @DELETE("friend-requests/{id}")
    suspend fun deleteRequest(@Path("id") requestId: String): ApiResponse<Unit>

    @POST("invitations/email")
    suspend fun sendEmailInvitation(
        @Body body: EmailInvitationRequest,
    ): ApiResponse<EmailInvitationResponse>
}
