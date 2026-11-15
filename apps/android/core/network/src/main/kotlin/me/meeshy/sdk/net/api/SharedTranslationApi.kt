package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.translation.ShareTranslationBody
import me.meeshy.sdk.model.translation.ShareTranslationResult
import me.meeshy.sdk.net.routes.ApiRoutesConversations
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Partager sa traduction, lire celles des autres — miroir de `SharedTranslationService` (iOS). */
interface SharedTranslationApi {
    @POST(ApiRoutesConversations.BY_ID_SHARED_TRANSLATIONS)
    suspend fun share(
        @Path("id") conversationId: String,
        @Body body: ShareTranslationBody,
    ): ApiResponse<ShareTranslationResult>

    /** [messageIds] et [languages] sont séparés par des virgules, comme la passerelle les lit. */
    @GET(ApiRoutesConversations.BY_ID_SHARED_TRANSLATIONS)
    suspend fun list(
        @Path("id") conversationId: String,
        @Query("messageIds") messageIds: String,
        @Query("languages") languages: String,
    ): ApiResponse<JsonElement>
}
