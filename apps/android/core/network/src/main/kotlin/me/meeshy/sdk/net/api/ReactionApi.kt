package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ReactionSyncResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** Add a reaction to a message — port of AddReactionRequest (ServiceModels.swift). */
@Serializable
data class AddReactionRequest(
    val messageId: String,
    val emoji: String,
)

interface ReactionApi {
    @POST("reactions")
    suspend fun add(@Body body: AddReactionRequest): ApiResponse<Unit>

    @DELETE("reactions/{messageId}/{emoji}")
    suspend fun remove(
        @Path("messageId") messageId: String,
        @Path("emoji", encoded = false) emoji: String,
    ): ApiResponse<Unit>

    @GET("reactions/{messageId}")
    suspend fun fetchDetails(@Path("messageId") messageId: String): ApiResponse<ReactionSyncResponse>
}
