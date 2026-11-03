package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.UpdateConversationResponse
import retrofit2.http.Body
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * Titre, description et avatar d'une conversation (`PUT /conversations/{id}`, #15179) : un champ `null` est omis, donc
 * laissé tel quel côté serveur — c'est ce qui rend la fusion champ par champ de la file sans perte.
 */
@Serializable
public data class UpdateConversationDetailsRequest(
    val title: String? = null,
    val description: String? = null,
    val avatar: String? = null,
)

/** Même route que `ConversationApi.updateSettings`, autre sous-ensemble de champs (interface à part : aucune doublure à tenir). */
public interface ConversationDetailsApi {
    @PUT("conversations/{id}")
    public suspend fun updateDetails(
        @Path("id") id: String,
        @Body body: UpdateConversationDetailsRequest,
    ): ApiResponse<UpdateConversationResponse>
}
