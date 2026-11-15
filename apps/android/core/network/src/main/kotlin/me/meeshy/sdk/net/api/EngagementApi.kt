package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Le corps de `POST /me/meesh/mint`. [requestId] porte l'IDEMPOTENCE : généré une fois par INTENTION de frappe,
 * jamais par requête — sinon un rejeu deviendrait une seconde frappe. [maxPrice] est le prix que l'écran a
 * montré (garde 409 `PRICE_CHANGED`) ; absent du corps quand `null` : une passerelle antérieure ne le connaît pas.
 */
@Serializable
data class MeeshMintRequest(
    val requestId: String,
    val maxPrice: Int? = null,
)

/**
 * La progression (badges, séries, niveaux, élan, Meeshes) — port de `EngagementProgressService` iOS.
 *
 * Les charges sont rendues en [JsonElement] et lues par `EngagementProgressParser` / `GameWriteParser` (`:core:model`) :
 * une matière ou une clé de palier ajoutée au serveur avant la mise à jour de l'app ne doit jamais faire échouer
 * le décodage d'une réponse DÉJÀ acquise.
 */
interface EngagementApi {
    @GET("me/engagement")
    suspend fun progress(): ApiResponse<JsonElement>

    @POST("me/meesh/mint")
    suspend fun mintMeesh(@Body body: MeeshMintRequest): ApiResponse<JsonElement>
}
