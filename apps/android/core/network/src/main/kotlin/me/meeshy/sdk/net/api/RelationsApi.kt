package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.routes.ApiRoutesRelations
import retrofit2.http.GET
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

/** Le niveau de lien avec une personne — miroir de `RelationsEndpoint.byUserId` d'iOS. */
interface RelationsApi {
    @GET(ApiRoutesRelations.BY_USER_ID)
    suspend fun byUserId(@Path("userId") userId: String): ApiResponse<RelationLevelResponse>
}
