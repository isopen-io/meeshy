package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.model.UpdateConversationResponse
import me.meeshy.sdk.model.UpdateConversationSettingsRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
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
    val categoryId: String? = null,
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

    // POST, jamais PATCH : le gateway n'enregistre ce chemin qu'en POST
    // (routes/message-read-status.ts /mark-as-read + alias /read). Le PATCH
    // historique répondait 404 en silence — l'outbox épuisait ses tentatives
    // et les badges ne se vidaient jamais durablement.
    @POST("conversations/{id}/mark-as-read")
    suspend fun markRead(@Path("id") id: String): ApiResponse<Unit>

    @PUT("user-preferences/conversations/{id}")
    suspend fun updatePreferences(
        @Path("id") id: String,
        @Body body: ConversationPreferencesUpdate,
    ): ApiResponse<Unit>

    /**
     * Admin conversation-settings patch (write-role / announcement / slow-mode /
     * auto-translate) sent to `PUT /conversations/{id}`. Null body fields are
     * omitted so only changed settings are persisted.
     */
    @PUT("conversations/{id}")
    suspend fun updateSettings(
        @Path("id") id: String,
        @Body body: UpdateConversationSettingsRequest,
    ): ApiResponse<UpdateConversationResponse>
}
