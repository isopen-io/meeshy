package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.relation.RelationLinkWire
import me.meeshy.sdk.model.relation.RelationRitualBody
import me.meeshy.sdk.model.relation.RelationRitualStep
import me.meeshy.sdk.model.relation.RelationsConfig
import me.meeshy.sdk.net.routes.ApiRoutesRelations
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * La réponse de `GET /relations/:userId` (#13998) : le niveau EFFECTIF du lien du lecteur avec [userId], tel que la
 * passerelle le sert. [effectiveLevel] reste la chaîne brute (`PUBLIC`, `COMMUNITY`, `ACQUAINTANCE`, `FRIEND`, `CLOSE`,
 * `BLOOD`) : un niveau ajouté au serveur avant la mise à jour de l'app n'est pas fatal. `PUBLIC` dit aussi « bloqué » et
 * « inconnu » — voulu côté serveur.
 */
@Serializable
data class RelationLevelResponse(
    val userId: String,
    val effectiveLevel: String,
)

/** Les cercles — miroir de `RelationsEndpoint` d'iOS (`RelationsService.swift`, #13938). */
interface RelationsApi {
    /** Le niveau de lien avec une personne. */
    @GET(ApiRoutesRelations.BY_USER_ID)
    suspend fun byUserId(@Path("userId") userId: String): ApiResponse<RelationLevelResponse>

    /** « Mes cercles » : chaque lien d'au moins Connaissance, avec sa progression et son éligibilité. */
    @GET(ApiRoutesRelations.ROOT)
    suspend fun links(): ApiResponse<List<RelationLinkWire>>

    /** Les niveaux, leurs libellés des sept langues et leurs icônes. */
    @GET(ApiRoutesRelations.CONFIG)
    suspend fun config(): ApiResponse<RelationsConfig>

    /** Le rituel du Sang : `start` ouvre ou rejoint, `hold` se rejoue tant qu'on tient l'écran, `confirm` scelle. */
    @POST(ApiRoutesRelations.BY_USER_ID_RITUAL)
    suspend fun ritual(@Path("userId") userId: String, @Body body: RelationRitualBody): ApiResponse<RelationRitualStep>
}
