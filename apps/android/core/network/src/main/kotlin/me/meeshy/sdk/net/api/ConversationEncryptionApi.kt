package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.NeverRetried
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** `POST /conversations/:id/encryption` : le mode que la passerelle accepte (`SetEncryptionModeBodySchema`). */
@Serializable
data class SetEncryptionModeBody(val mode: String)

/**
 * Le régime de chiffrement d'une conversation (`services/gateway/src/routes/conversation-encryption.ts`,
 * #12522) : le lire, l'activer, désactiver le chiffrement AU REPOS. La passerelle fait foi — rôle de
 * plateforme ANALYST ou plus (403), appartenance (404 d'un étranger), écriture conditionnelle
 * (409 `E2EE_REGIME_CHANGED`) — et refuse de quitter le bout en bout (409 `E2EE_IRREVERSIBLE`, #12949).
 *
 * La `data` reste un OBJET brut : `MeeshyApi.json` coerce, et un drapeau de sécurité coercé est une
 * garantie inventée. Le décodage strict est `ConversationEncryptionStatusDecoder`. Les deux écritures
 * ne sont jamais rejouées ([NeverRetried]) : un rejeu après une activation réussie lirait « déjà activé ».
 */
interface ConversationEncryptionApi {
    @GET("conversations/{conversationId}/encryption-status")
    suspend fun status(@Path("conversationId") conversationId: String): ApiResponse<JsonObject>

    @NeverRetried
    @POST("conversations/{conversationId}/encryption")
    suspend fun enable(
        @Path("conversationId") conversationId: String,
        @Body body: SetEncryptionModeBody,
    ): ApiResponse<JsonObject>

    @NeverRetried
    @DELETE("conversations/{conversationId}/encryption")
    suspend fun disable(@Path("conversationId") conversationId: String): ApiResponse<JsonObject>
}
