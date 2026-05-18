package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.SendMessageRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface MessageApi {
    @GET("conversations/{cid}/messages")
    suspend fun list(
        @Path("cid") conversationId: String,
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiMessage>>

    @POST("conversations/{cid}/messages")
    suspend fun send(
        @Path("cid") conversationId: String,
        @Body body: SendMessageRequest,
    ): ApiResponse<ApiMessage>
}
