package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ConversationReorderBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Read and reorder side of the per-user conversation preferences
 * (`/user-preferences/...`); the `PUT` write side lives in [ConversationApi.updatePreferences].
 */
interface ConversationPreferencesApi {

    /** One conversation's preference row (iOS `getConversationPreferences`). */
    @GET("user-preferences/conversations/{id}")
    suspend fun getPreferences(@Path("id") id: String): ApiResponse<ApiConversationPreferences>

    /** A page of the user's preference rows, from which the distinct tags are derived. */
    @GET("user-preferences/conversations")
    suspend fun listPreferences(
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiConversationPreferences>>

    /** Batch drag-to-reorder: `{ updates: [{ conversationId, orderInCategory }] }`. */
    @POST("user-preferences/reorder")
    suspend fun reorder(@Body body: ConversationReorderBody): ApiResponse<Unit>
}

@dagger.Module
@dagger.hilt.InstallIn(dagger.hilt.components.SingletonComponent::class)
internal object ConversationPreferencesRoutesModule {

    @dagger.Provides
    fun providesConversationPreferencesApi(api: me.meeshy.sdk.net.MeeshyApi): ConversationPreferencesApi =
        api.service(ConversationPreferencesApi::class.java)
}
