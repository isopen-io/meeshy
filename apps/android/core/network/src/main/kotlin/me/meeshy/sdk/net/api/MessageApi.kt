package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.ConditionalResult
import me.meeshy.sdk.net.conditionalApiCall
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

@Serializable
data class EditMessageRequest(val content: String)

interface MessageApi {
    @GET("conversations/{cid}/messages")
    suspend fun list(
        @Path("cid") conversationId: String,
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
        @Query("before") before: String? = null,
    ): ApiResponse<List<ApiMessage>>

    /**
     * The recent-window request [MessageCacheSource][me.meeshy.sdk.conversation.
     * MessageCacheSource] revalidates with (no `offset`/`limit`/`before` — always
     * the same shape for a given [conversationId]), carrying an optional
     * `If-None-Match` and returning the raw [Response] to reach the `ETag`
     * header and distinguish a genuine 304 from a decoded 200. Gateway
     * contract: `sendWithETag`, `services/gateway/src/routes/conversations/
     * messages-list.ts:825-829`. #5188 — never call this directly; go through
     * [listConditionalResult], which keeps [Response] confined to this module.
     */
    @GET("conversations/{cid}/messages")
    suspend fun listConditional(
        @Path("cid") conversationId: String,
        @Header("If-None-Match") ifNoneMatch: String? = null,
    ): Response<ApiResponse<List<ApiMessage>>>

    @POST("conversations/{cid}/messages")
    suspend fun send(
        @Path("cid") conversationId: String,
        @Body body: SendMessageRequest,
    ): ApiResponse<ApiMessage>

    @PATCH("messages/{id}")
    suspend fun edit(
        @Path("id") messageId: String,
        @Body body: EditMessageRequest,
    ): ApiResponse<ApiMessage>

    @DELETE("messages/{id}")
    suspend fun delete(@Path("id") messageId: String): ApiResponse<Unit>

    @GET("conversations/{cid}/messages/search")
    suspend fun search(
        @Path("cid") conversationId: String,
        @Query("q") query: String,
        @Query("limit") limit: Int? = null,
        @Query("cursor") cursor: String? = null,
    ): ApiResponse<List<ApiMessage>>

    @PUT("conversations/{cid}/messages/{mid}/pin")
    suspend fun pin(
        @Path("cid") conversationId: String,
        @Path("mid") messageId: String,
    ): ApiResponse<Unit>

    @DELETE("conversations/{cid}/messages/{mid}/pin")
    suspend fun unpin(
        @Path("cid") conversationId: String,
        @Path("mid") messageId: String,
    ): ApiResponse<Unit>
}

/**
 * [MessageApi.listConditional] folded into a [ConditionalResult] — a thin
 * wrapper whose only purpose is keeping every `retrofit2.Response` type
 * confined to `:core:network` (retrofit is an `implementation`, not `api`,
 * dependency of this module — `:sdk-core`'s [me.meeshy.sdk.conversation.
 * MessageCacheSource] cannot reference [Response] itself, only this module's
 * own [ConditionalResult]/`ApiError` types). Mirrors [TusApi]'s
 * `createSession`/`patchChunk`. #5188.
 */
suspend fun MessageApi.listConditionalResult(
    conversationId: String,
    ifNoneMatch: String?,
): ConditionalResult<List<ApiMessage>> =
    conditionalApiCall { listConditional(conversationId, ifNoneMatch) }
