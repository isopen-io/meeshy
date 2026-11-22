package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunityJoinRequest
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.ApiCommunitySearchResult
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CommunityJoinOutcome
import me.meeshy.sdk.model.CommunityJoinRequestRejected
import me.meeshy.sdk.model.CommunityMini
import me.meeshy.sdk.model.CreateCommunityRequest
import me.meeshy.sdk.model.IdentifierAvailability
import me.meeshy.sdk.model.InviteMemberRequest
import me.meeshy.sdk.model.JoinCommunityRequest
import me.meeshy.sdk.model.UpdateCommunityRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Add a member to a community — port of CommunityService.addMember inline body. */
@Serializable
data class AddCommunityMemberRequest(
    val userId: String,
    val role: String = "member",
)

/** Update a community member's role — port of CommunityService.updateMemberRole inline body. */
@Serializable
data class UpdateCommunityMemberRoleRequest(
    val role: String,
)

/** Suspendre ou relancer le lien d'entrée d'une communauté (#19661) — corps de `PUT communities/{id}/join-link`. */
@Serializable
data class CommunityJoinLinkStateRequest(
    val paused: Boolean,
)

/** L'état servi du lien d'entrée (#19661) : l'instant de la pause, nul quand le lien est actif. */
@Serializable
data class CommunityJoinLinkState(
    val joinLinkPausedAt: String? = null,
)

interface CommunityApi {
    @GET("communities")
    suspend fun list(
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
        @Query("search") search: String? = null,
    ): ApiResponse<List<ApiCommunity>>

    /** Les communautés créées ou administrées (`role=admin,moderator`) — port de `CommunityLinkService`. */
    @GET("communities/mine")
    suspend fun mine(@Query("role") role: String? = null): ApiResponse<List<CommunityMini>>

    @GET("communities/search")
    suspend fun search(
        @Query("q") query: String,
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiCommunitySearchResult>>

    @GET("communities/{id}")
    suspend fun get(@Path("id") communityId: String): ApiResponse<ApiCommunity>

    @POST("communities")
    suspend fun create(@Body body: CreateCommunityRequest): ApiResponse<ApiCommunity>

    @PUT("communities/{id}")
    suspend fun update(
        @Path("id") communityId: String,
        @Body body: UpdateCommunityRequest,
    ): ApiResponse<ApiCommunity>

    @DELETE("communities/{id}")
    suspend fun delete(@Path("id") communityId: String): ApiResponse<Unit>

    @GET("communities/{id}/members")
    suspend fun getMembers(
        @Path("id") communityId: String,
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiCommunityMember>>

    @POST("communities/{id}/members")
    suspend fun addMember(
        @Path("id") communityId: String,
        @Body body: AddCommunityMemberRequest,
    ): ApiResponse<ApiCommunityMember>

    @PATCH("communities/{id}/members/{memberId}/role")
    suspend fun updateMemberRole(
        @Path("id") communityId: String,
        @Path("memberId") memberId: String,
        @Body body: UpdateCommunityMemberRoleRequest,
    ): ApiResponse<ApiCommunityMember>

    @DELETE("communities/{id}/members/{userId}")
    suspend fun removeMember(
        @Path("id") communityId: String,
        @Path("userId") userId: String,
    ): ApiResponse<Unit>

    /** `acceptsPending` (#19870) : une communauté qui valide chaque entrée rend une demande (202), jamais un 409. */
    @POST("communities/{id}/join")
    suspend fun join(
        @Path("id") communityId: String,
        @Body body: JoinCommunityRequest = JoinCommunityRequest.AcceptsPending,
    ): ApiResponse<CommunityJoinOutcome>

    /**
     * Les demandes d'entrée EN ATTENTE (#19878), les plus récentes d'abord, par pages continuées avec
     * `pagination.nextCursor`. Intendants seuls : tout autre lecteur reçoit le 404 générique.
     */
    @GET("communities/{id}/join-requests")
    suspend fun joinRequests(
        @Path("id") communityId: String,
        @Query("limit") limit: Int,
        @Query("cursor") cursor: String? = null,
    ): ApiResponse<List<ApiCommunityJoinRequest>>

    /** Accepter : le demandeur entre, et la passerelle sert le membre entré. */
    @POST("communities/{id}/join-requests/{requestId}/accept")
    suspend fun acceptJoinRequest(
        @Path("id") communityId: String,
        @Path("requestId") requestId: String,
    ): ApiResponse<ApiCommunityMember>

    /** Refuser : personne n'entre, le demandeur seul l'apprend, sans le nom de qui a tranché. */
    @POST("communities/{id}/join-requests/{requestId}/reject")
    suspend fun rejectJoinRequest(
        @Path("id") communityId: String,
        @Path("requestId") requestId: String,
    ): ApiResponse<CommunityJoinRequestRejected>

    /**
     * Suspendre ou relancer le lien d'entrée (#19661) : intendants seuls, tout autre lecteur reçoit le 404
     * générique. Un lien en pause refuse l'entrée `via: "link"` (403 `COMMUNITY_LINK_PAUSED`). Écran : #20255.
     */
    @PUT("communities/{id}/join-link")
    suspend fun setJoinLinkState(
        @Path("id") communityId: String,
        @Body body: CommunityJoinLinkStateRequest,
    ): ApiResponse<CommunityJoinLinkState>

    @POST("communities/{id}/leave")
    suspend fun leave(@Path("id") communityId: String): ApiResponse<Unit>

    @POST("communities/{id}/invite")
    suspend fun invite(
        @Path("id") communityId: String,
        @Body body: InviteMemberRequest,
    ): ApiResponse<ApiCommunityMember>

    @GET("communities/check-identifier/{identifier}")
    suspend fun checkIdentifier(
        @Path("identifier") identifier: String,
    ): ApiResponse<IdentifierAvailability>

    @GET("communities/{id}/conversations")
    suspend fun getConversations(
        @Path("id") communityId: String,
    ): ApiResponse<List<ApiConversation>>

    @POST("communities/{id}/conversations/{conversationId}")
    suspend fun addConversation(
        @Path("id") communityId: String,
        @Path("conversationId") conversationId: String,
    ): ApiResponse<ApiConversation>
}
