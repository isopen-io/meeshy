package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.ApiCommunitySearchResult
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateCommunityRequest
import me.meeshy.sdk.model.IdentifierAvailability
import me.meeshy.sdk.model.InviteMemberRequest
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

interface CommunityApi {
    @GET("communities")
    suspend fun list(
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
        @Query("search") search: String? = null,
    ): ApiResponse<List<ApiCommunity>>

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

    @POST("communities/{id}/join")
    suspend fun join(@Path("id") communityId: String): ApiResponse<ApiCommunityMember>

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
