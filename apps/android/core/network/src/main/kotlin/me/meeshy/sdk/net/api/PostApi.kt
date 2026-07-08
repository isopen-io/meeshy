package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.PostViewersResponse
import me.meeshy.sdk.model.StoryEffects
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Create a post — port of CreatePostRequest (ServiceModels.swift). */
@Serializable
data class CreatePostRequest(
    val content: String? = null,
    val type: String = "POST",
    val visibility: String = "PUBLIC",
    val moodEmoji: String? = null,
    val mediaIds: List<String>? = null,
    val audioUrl: String? = null,
    val audioDuration: Int? = null,
    val originalLanguage: String? = null,
    val mobileTranscription: MobileTranscriptionPayload? = null,
    val repostOfId: String? = null,
)

/** Mobile transcription payload — port of MobileTranscriptionPayload (ServiceModels.swift). */
@Serializable
data class MobileTranscriptionPayload(
    val text: String,
    val language: String,
    val confidence: Double? = null,
    val durationMs: Int? = null,
    val segments: List<MobileTranscriptionSegment> = emptyList(),
)

/** A mobile transcription segment — port of MobileTranscriptionSegment (ServiceModels.swift). */
@Serializable
data class MobileTranscriptionSegment(
    val text: String,
    val start: Double? = null,
    val end: Double? = null,
    val speakerId: String? = null,
)

/** Create a story — port of CreateStoryRequest (ServiceModels.swift). */
@Serializable
data class CreateStoryRequest(
    val type: String = "STORY",
    val content: String? = null,
    val storyEffects: StoryEffects? = null,
    val visibility: String = "PUBLIC",
    val originalLanguage: String? = null,
    val mediaIds: List<String>? = null,
    val repostOfId: String? = null,
)

/** Update a post — port of UpdatePostRequest (ServiceModels.swift). */
@Serializable
data class UpdatePostRequest(
    val content: String? = null,
    val visibility: String? = null,
    val moodEmoji: String? = null,
)

/** Create a comment — port of CreateCommentRequest (ServiceModels.swift). */
@Serializable
data class CreateCommentRequest(
    val content: String,
    val parentId: String? = null,
    val effectFlags: Int? = null,
)

/** Repost a post — port of RepostRequest (StoryModels.swift). */
@Serializable
data class RepostPostRequest(
    val content: String? = null,
    val isQuote: Boolean = false,
    val targetType: String? = null,
)

/** Request an on-demand translation for a post. */
@Serializable
data class PostTranslationRequest(
    val targetLanguage: String,
)

/** Record a post view with an optional dwell duration. */
@Serializable
data class PostViewRequest(
    val duration: Int? = null,
)

/** Batch impression-tracking body for a feed slice. */
@Serializable
data class PostImpressionsRequest(
    val postIds: List<String>,
    val source: String = "feed",
)

interface PostApi {
    @GET("posts/feed")
    suspend fun getFeed(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    @GET("posts/feed/stories")
    suspend fun getStories(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    /**
     * Vertical full-screen reel thread (`GET /posts/feed/reels`). With [seed] (a
     * reel touched in the Feed) the gateway returns an affinity thread starting at
     * that reel; without a seed it returns the default reel feed.
     */
    @GET("posts/feed/reels")
    suspend fun getReels(
        @Query("seed") seed: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    @POST("posts")
    suspend fun create(@Body body: CreatePostRequest): ApiResponse<ApiPost>

    @POST("posts")
    suspend fun createStory(@Body body: CreateStoryRequest): ApiResponse<ApiPost>

    @PUT("posts/{id}")
    suspend fun update(@Path("id") postId: String, @Body body: UpdatePostRequest): ApiResponse<ApiPost>

    @DELETE("posts/{id}")
    suspend fun delete(@Path("id") postId: String): ApiResponse<Unit>

    @GET("posts/{id}")
    suspend fun getPost(@Path("id") postId: String): ApiResponse<ApiPost>

    @POST("posts/{id}/like")
    suspend fun like(@Path("id") postId: String): ApiResponse<Unit>

    @DELETE("posts/{id}/like")
    suspend fun unlike(@Path("id") postId: String): ApiResponse<Unit>

    @POST("posts/{id}/bookmark")
    suspend fun bookmark(@Path("id") postId: String): ApiResponse<Unit>

    @DELETE("posts/{id}/bookmark")
    suspend fun removeBookmark(@Path("id") postId: String): ApiResponse<Unit>

    @GET("posts/bookmarks")
    suspend fun getBookmarks(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    @POST("posts/{id}/pin")
    suspend fun pin(@Path("id") postId: String): ApiResponse<Unit>

    @DELETE("posts/{id}/pin")
    suspend fun unpin(@Path("id") postId: String): ApiResponse<Unit>

    @POST("posts/{id}/share")
    suspend fun share(@Path("id") postId: String): ApiResponse<Unit>

    @POST("posts/{id}/repost")
    suspend fun repost(
        @Path("id") postId: String,
        @Body body: RepostPostRequest,
    ): ApiResponse<ApiPost>

    @POST("posts/{id}/translate")
    suspend fun requestTranslation(
        @Path("id") postId: String,
        @Body body: PostTranslationRequest,
    ): ApiResponse<Unit>

    @POST("posts/{id}/view")
    suspend fun viewPost(
        @Path("id") postId: String,
        @Body body: PostViewRequest,
    ): ApiResponse<Unit>

    @GET("posts/{id}/views")
    suspend fun getPostViews(
        @Path("id") postId: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): ApiResponse<PostViewersResponse>

    @GET("posts/user/{userId}")
    suspend fun getUserPosts(
        @Path("userId") userId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    @GET("posts/community/{communityId}")
    suspend fun getCommunityPosts(
        @Path("communityId") communityId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    @POST("posts/impressions/batch")
    suspend fun recordImpressions(@Body body: PostImpressionsRequest): ApiResponse<Unit>

    @GET("posts/{id}/comments")
    suspend fun getComments(
        @Path("id") postId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPostComment>>

    @POST("posts/{id}/comments")
    suspend fun addComment(
        @Path("id") postId: String,
        @Body body: CreateCommentRequest,
    ): ApiResponse<ApiPostComment>

    @GET("posts/{id}/comments/{commentId}/replies")
    suspend fun getCommentReplies(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPostComment>>

    @POST("posts/{id}/comments/{commentId}/like")
    suspend fun likeComment(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
    ): ApiResponse<Unit>

    @DELETE("posts/{id}/comments/{commentId}/like")
    suspend fun unlikeComment(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
    ): ApiResponse<Unit>

    @DELETE("posts/{id}/comments/{commentId}")
    suspend fun deleteComment(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
    ): ApiResponse<Unit>
}
