package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateConversationRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PATCH
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Partial per-user conversation-preference update sent to
 * `PUT /user-preferences/conversations/{id}` (gateway `conversation-preferences`
 * route). Null fields are omitted so each call patches only what changed.
 */
@Serializable
data class ConversationPreferencesUpdate(
    val isPinned: Boolean? = null,
    val isMuted: Boolean? = null,
    val isArchived: Boolean? = null,
    val mentionsOnly: Boolean? = null,
    val customName: String? = null,
    val reaction: String? = null,
)

interface ConversationApi {
    @GET("conversations")
    suspend fun list(
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiConversation>>

    @GET("conversations/{id}")
    suspend fun getById(@Path("id") id: String): ApiResponse<ApiConversation>

    @POST("conversations")
    suspend fun create(@Body body: CreateConversationRequest): ApiResponse<ApiConversation>

    @PATCH("conversations/{id}/read")
    suspend fun markRead(@Path("id") id: String): ApiResponse<Unit>

    @PUT("user-preferences/conversations/{id}")
    suspend fun updatePreferences(
        @Path("id") id: String,
        @Body body: ConversationPreferencesUpdate,
    ): ApiResponse<Unit>
}
