package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.SendMessageRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
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
