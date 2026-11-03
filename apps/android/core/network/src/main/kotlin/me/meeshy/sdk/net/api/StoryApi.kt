package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ContentRemovalRequest
import me.meeshy.sdk.model.StoryViewersResponse
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** React to a story with an explicit emoji — port of LikeRequest (ServiceModels.swift). */
@Serializable
data class StoryLikeRequest(
    val emoji: String,
)

/**
 * Corps de `POST /posts/:id/translate` — `force` est omis quand il est faux (la route le lit comme optionnel) ;
 * `MeeshyApi.json` a `encodeDefaults=false`, donc le défaut `null` ne part pas.
 */
@Serializable
data class StoryTranslationRequest(
    val targetLanguage: String,
    val force: Boolean? = null,
)

/**
 * Stories are posts: the gateway exposes them under the posts routes.
 * Port of StoryService (StoryService.swift) — the in-memory single-post cache
 * is intentionally not ported (REST surface only).
 */
interface StoryApi {
    /**
     * Sole Kotlin declaration of `GET /posts/feed/stories` (#4889) — `PostApi`
     * carried an unused twin, `getStories`, removed rather than kept: this is
     * the endpoint `StoryRepository` actually calls.
     */
    @GET("posts/feed/stories")
    suspend fun list(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
        @Query("updatedSince") updatedSince: String? = null,
    ): ApiResponse<List<ApiPost>>

    /**
     * `GET /posts/stories/mine` — the caller's COMPLETE story archive (active and expired),
     * keyset-paginated: the envelope's `pagination.nextCursor` drives the next page.
     */
    @GET("posts/stories/mine")
    suspend fun listMine(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    /**
     * `POST /posts/{id}/republish` — the SAME story restarts with a fresh publication date and
     * zeroed engagement (works on an expired or FRIENDS story, unlike a repost).
     */
    @POST("posts/{id}/republish")
    suspend fun republish(@Path("id") storyId: String): ApiResponse<ApiPost>

    @POST("posts/{id}/view")
    suspend fun markViewed(@Path("id") storyId: String): ApiResponse<Unit>

    @DELETE("posts/{id}")
    suspend fun delete(@Path("id") storyId: String): ApiResponse<Unit>

    /** Retrait de la story d'un AUTRE avec son motif (#11151) : un 2xx confirme, la charge n'est pas décodée. */
    @HTTP(method = "DELETE", path = "posts/{id}", hasBody = true)
    suspend fun deleteWithReason(
        @Path("id") storyId: String,
        @Body body: ContentRemovalRequest,
    ): Response<ResponseBody>

    /** Demande la traduction serveur d'une story ; la charge arrive par le socket social, un 2xx suffit. */
    @POST("posts/{id}/translate")
    suspend fun requestTranslation(
        @Path("id") storyId: String,
        @Body body: StoryTranslationRequest,
    ): Response<ResponseBody>

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

    /** Les réponses d'un commentaire racine, par pages de 20 en ordre ASC (curseur = dernier id servi). */
    @GET("posts/{id}/comments/{commentId}/replies")
    suspend fun commentReplies(
        @Path("id") storyId: String,
        @Path("commentId") commentId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPostComment>>

    @POST("posts/{id}/comments/{commentId}/like")
    suspend fun likeComment(
        @Path("id") storyId: String,
        @Path("commentId") commentId: String,
    ): ApiResponse<Unit>

    @DELETE("posts/{id}/comments/{commentId}/like")
    suspend fun unlikeComment(
        @Path("id") storyId: String,
        @Path("commentId") commentId: String,
    ): ApiResponse<Unit>

    @PATCH("posts/{id}/comments/{commentId}")
    suspend fun updateComment(
        @Path("id") storyId: String,
        @Path("commentId") commentId: String,
        @Body body: UpdateCommentRequest,
    ): ApiResponse<ApiPostComment>

    @DELETE("posts/{id}/comments/{commentId}")
    suspend fun deleteComment(
        @Path("id") storyId: String,
        @Path("commentId") commentId: String,
    ): ApiResponse<Unit>

    @POST("posts/{id}/repost")
    suspend fun repost(
        @Path("id") storyId: String,
        @Body body: RepostPostRequest,
    ): ApiResponse<ApiPost>

    @GET("posts/{id}")
    suspend fun fetchPost(@Path("id") postId: String): ApiResponse<ApiPost>

    @GET("posts/{id}/interactions")
    suspend fun viewers(@Path("id") storyId: String): ApiResponse<StoryViewersResponse>
}
