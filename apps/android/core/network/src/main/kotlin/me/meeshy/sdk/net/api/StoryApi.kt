package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.StoryViewersResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** React to a story with an explicit emoji — port of LikeRequest (ServiceModels.swift). */
@Serializable
data class StoryLikeRequest(
    val emoji: String,
)

/**
 * Stories are posts: the gateway exposes them under the posts routes.
 * Port of StoryService (StoryService.swift) — the in-memory single-post cache
 * is intentionally not ported (REST surface only).
 */
interface StoryApi {
    @GET("posts/feed/stories")
    suspend fun list(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    @POST("posts/{id}/view")
    suspend fun markViewed(@Path("id") storyId: String): ApiResponse<Unit>

    @DELETE("posts/{id}")
    suspend fun delete(@Path("id") storyId: String): ApiResponse<Unit>

    @POST("posts/{id}/like")
    suspend fun react(
        @Path("id") storyId: String,
        @Body body: StoryLikeRequest,
    ): ApiResponse<Unit>

    @GET("posts/{id}/comments")
    suspend fun comments(
        @Path("id") storyId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPostComment>>

    @POST("posts/{id}/comments")
    suspend fun comment(
        @Path("id") storyId: String,
        @Body body: CreateCommentRequest,
    ): ApiResponse<ApiPostComment>

    @POST("posts/{id}/repost")
    suspend fun repost(
        @Path("id") storyId: String,
        @Body body: RepostPostRequest,
    ): ApiResponse<Unit>

    @GET("posts/{id}")
    suspend fun fetchPost(@Path("id") postId: String): ApiResponse<ApiPost>

    @GET("posts/{id}/interactions")
    suspend fun viewers(@Path("id") storyId: String): ApiResponse<StoryViewersResponse>
}
